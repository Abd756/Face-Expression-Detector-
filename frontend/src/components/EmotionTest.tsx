'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, StopCircle, RefreshCw, BarChart2, Video, Mic, MicOff, Activity } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type Emotions = {
    [key: string]: number;
};

type AnalysisData = {
    detected: boolean;
    dominant_emotion?: string;
    emotions?: Emotions;
    region?: any;
};

type AudioAnalysisData = {
    success: boolean;
    fluency: number;
    long_pauses: number;
    is_speaking: boolean;
    vocal_status?: 'fluent' | 'thinking' | 'stalling' | 'freeze';
    silence_streak?: number;
    error?: string;
};

export default function EmotionTest() {
    const [isStreaming, setIsStreaming] = useState(false);
    const [data, setData] = useState<AnalysisData | null>(null);
    const [audioData, setAudioData] = useState<AudioAnalysisData | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sessionIdRef = useRef<string>('');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    // Initialize individual session ID
    useEffect(() => {
        sessionIdRef.current = Math.random().toString(36).substring(2, 15);
    }, []);

    // Start local camera and audio
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: true,
                audio: true 
            });
            
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }

            // Set up MediaRecorder for Audio
            const audioStream = new MediaStream(stream.getAudioTracks());
            const recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
            
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };

            recorder.onstop = async () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                audioChunksRef.current = [];
                sendAudioToBackend(blob);
            };

            mediaRecorderRef.current = recorder;
            recorder.start();
            setIsStreaming(true);
        } catch (error) {
            console.error("Failed to access media:", error);
            alert("Could not access camera/mic. Please ensure permissions are granted.");
        }
    };

    const sendAudioToBackend = async (blob: Blob) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            const base64Audio = reader.result as string;
            try {
                const response = await fetch(`${API_BASE_URL}/analyze_audio`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        audio: base64Audio,
                        session_id: sessionIdRef.current 
                    })
                });
                const result = await response.json();
                setAudioData(result);
            } catch (error) {
                console.error("Audio analysis failed:", error);
            }
        };
    };

    // Stop camera and release tracks
    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        setIsStreaming(false);
        setData(null);
        setAudioData(null);
    };

    // Audio capture loop (send every 3 seconds)
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isStreaming && mediaRecorderRef.current) {
            interval = setInterval(() => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.stop(); // This triggers onstop and sends the blob
                    mediaRecorderRef.current.start(); // Start new chunk
                }
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [isStreaming]);

    // Capture and analyze loop (Video)
    useEffect(() => {
        let timeoutId: NodeJS.Timeout;
        
        const captureFrame = async () => {
            if (!isStreaming || !videoRef.current || !canvasRef.current) return;

            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');

            if (context && video.videoWidth > 0) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = canvas.toDataURL('image/jpeg', 0.6);

                try {
                    const response = await fetch(`${API_BASE_URL}/analyze`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            image: imageData,
                            session_id: sessionIdRef.current 
                        })
                    });
                    const result = await response.json();
                    
                    if (isStreaming) {
                        setData(result);
                        timeoutId = setTimeout(captureFrame, 200);
                    }
                } catch (error) {
                    console.error("Analysis request failed:", error);
                    if (isStreaming) {
                        timeoutId = setTimeout(captureFrame, 1000);
                    }
                }
            } else {
                timeoutId = setTimeout(captureFrame, 500);
            }
        };

        if (isStreaming) {
            captureFrame();
        }
        
        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [isStreaming]);

    const emotionList = ['happy', 'sad', 'angry', 'neutral', 'surprise', 'fear', 'disgust'];

    const getBarColor = (emotion: string) => {
        switch (emotion) {
            case 'happy': return 'bg-green-500';
            case 'sad': return 'bg-blue-500';
            case 'angry': return 'bg-red-500';
            case 'neutral': return 'bg-gray-400';
            case 'surprise': return 'bg-yellow-400';
            case 'fear': return 'bg-purple-500';
            case 'disgust': return 'bg-orange-500';
            default: return 'bg-blue-300';
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4">
            <div className="flex flex-col lg:flex-row gap-4 w-full h-[92vh] max-w-[98vw] items-stretch">
                
                {/* Left Column: Video Feed (80% Width) */}
                <div className="lg:w-[80%] w-full flex flex-col h-full">
                    <div className="relative flex-1 bg-gray-950 rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden flex items-center justify-center group">
                        <canvas ref={canvasRef} className="hidden" />
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover shadow-inner ${isStreaming ? 'block' : 'hidden'}`}
                        />

                        {!isStreaming && (
                            <div className="text-center p-10 opacity-20">
                                <Video size={100} className="mx-auto mb-6 text-gray-500" />
                                <p className="text-3xl font-black text-gray-600 tracking-tighter">ENGINE OFFLINE</p>
                                <p className="text-sm text-gray-700 mt-2 font-bold uppercase tracking-widest">Awaiting initialization...</p>
                            </div>
                        )}
                        
                        {/* Status Badge */}
                        <div className="absolute top-6 left-6 flex items-center gap-2 bg-black/40 backdrop-blur-2xl px-4 py-2 rounded-2xl border border-white/5">
                            <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                            <span className="text-[9px] font-black tracking-widest uppercase text-white/70">
                                {isStreaming ? "Live Feed" : "Standby"}
                            </span>
                        </div>

                        {/* Top-Right Confidence Meter (Sleek) */}
                        {isStreaming && data?.dominant_emotion && data.emotions && (
                            <div className="absolute top-6 right-6 bg-black/40 backdrop-blur-2xl px-5 py-3 rounded-2xl border border-white/5 flex flex-col items-center">
                                <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Confidence</span>
                                <span className="text-2xl font-black text-blue-400">
                                    {data.emotions[data.dominant_emotion]?.toFixed(0)}%
                                </span>
                            </div>
                        )}

                        {/* Bottom-Left Multi-Modal Status */}
                        {isStreaming && (
                            <div className="absolute bottom-6 left-6 flex items-center gap-4 bg-black/40 backdrop-blur-2xl px-5 py-3 rounded-2xl border border-white/5">
                                <Activity className={`text-blue-500 transition-all ${audioData?.is_speaking ? 'animate-pulse' : 'opacity-20'}`} size={16} />
                                <div className="h-4 w-[1px] bg-white/10" />
                                <div className="flex items-center gap-2">
                                    {audioData?.is_speaking ? <Mic size={16} className="text-green-500" /> : <MicOff size={16} className="text-gray-600" />}
                                    <span className={`text-[9px] font-black uppercase tracking-widest ${audioData?.is_speaking ? 'text-green-500' : 'text-gray-600'}`}>
                                        {audioData?.is_speaking ? 'Voice' : 'Silent'}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom Controls */}
                    <div className="flex justify-center mt-4">
                        {!isStreaming ? (
                            <button
                                onClick={startCamera}
                                className="px-12 py-5 bg-white text-black hover:bg-gray-200 rounded-full font-black text-sm uppercase tracking-widest transition-all shadow-xl active:scale-95"
                            >
                                Start Analysis
                            </button>
                        ) : (
                            <button
                                onClick={stopCamera}
                                className="px-12 py-5 bg-red-600 text-white hover:bg-red-700 rounded-full font-black text-sm uppercase tracking-widest transition-all shadow-xl active:scale-95"
                            >
                                End Session
                            </button>
                        )}
                    </div>
                </div>

                {/* Right Column: Features Stack (20% Width) */}
                <div className="lg:w-[20%] w-full flex flex-col gap-4 overflow-y-auto pr-2">
                    
                    {/* Row 1: Facial Sentiment */}
                    <div className="bg-gray-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-5 shadow-xl">
                        <div className="flex items-center gap-2 mb-4 opacity-60">
                            <BarChart2 size={16} className="text-blue-400" />
                            <h2 className="text-[10px] font-black uppercase tracking-[0.25em]">Sentiment</h2>
                        </div>

                        {!isStreaming || !data ? (
                            <div className="h-32 flex items-center justify-center text-gray-700">
                                 <p className="text-[9px] uppercase tracking-widest font-black animate-pulse">Waiting...</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="text-center py-2 bg-white/5 rounded-2xl">
                                    <p className="text-[8px] text-blue-400 uppercase tracking-widest mb-1 font-bold">Detected</p>
                                    <div className="text-2xl font-black text-white tracking-tight">
                                        {(data && data.dominant_emotion) ? data.dominant_emotion.toUpperCase() : "..." }
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {data.emotions && emotionList.slice(0, 5).map((emo) => {
                                        const score = data.emotions ? data.emotions[emo] : 0;
                                        const isDominant = emo === data.dominant_emotion;
                                        return (
                                            <div key={emo} className="space-y-1">
                                                <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-gray-500">
                                                    <span className={isDominant ? 'text-blue-400' : ''}>{emo}</span>
                                                    <span>{score?.toFixed(0)}%</span>
                                                </div>
                                                <div className="h-1 w-full bg-black rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${getBarColor(emo)} ${isDominant ? 'opacity-100' : 'opacity-20'}`}
                                                        style={{ width: `${score}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Row 2: Vocal Intel */}
                    <div className="bg-gray-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-5 shadow-xl">
                        <div className="flex items-center gap-2 mb-4 opacity-60">
                            <Mic size={16} className="text-teal-400" />
                            <h2 className="text-[10px] font-black uppercase tracking-[0.25em]">Voice Intel</h2>
                        </div>

                        {!isStreaming || !audioData ? (
                            <div className="h-32 flex items-center justify-center text-gray-700">
                                <Activity size={24} className="animate-pulse opacity-20" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-4 bg-gradient-to-br from-teal-500/10 to-blue-500/10 rounded-2xl border border-white/5">
                                    <p className="text-[8px] text-teal-400 uppercase tracking-widest mb-1 font-black">Fluency</p>
                                    <div className="text-3xl font-black text-white">
                                        {audioData ? audioData.fluency : 0}%
                                    </div>
                                    <div className="mt-3 h-1 w-full bg-black rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-teal-400 rounded-full transition-all duration-1000"
                                            style={{ width: `${(audioData && audioData.fluency) ? audioData.fluency : 0}%` }}
                                        />
                                    </div>
                                </div>
                                
                                {/* Real-time Vocal Status Badge */}
                                <div className={`p-4 rounded-2xl border transition-all duration-500 ${
                                    audioData.vocal_status === 'freeze' ? 'bg-red-500/10 border-red-500/20' :
                                    audioData.vocal_status === 'stalling' ? 'bg-orange-500/10 border-orange-500/20' :
                                    audioData.vocal_status === 'thinking' ? 'bg-yellow-500/10 border-yellow-500/20' :
                                    'bg-green-500/10 border-green-500/20'
                                }`}>
                                    <p className="text-[8px] text-gray-500 uppercase tracking-widest mb-1.5 font-bold text-center">Current Flow</p>
                                    <div className={`text-[10px] font-black text-center uppercase tracking-widest ${
                                        audioData.vocal_status === 'freeze' ? 'text-red-500' :
                                        audioData.vocal_status === 'stalling' ? 'text-orange-400' :
                                        audioData.vocal_status === 'thinking' ? 'text-yellow-400' :
                                        'text-green-500'
                                    }`}>
                                        {audioData.vocal_status === 'freeze' ? 'Critical Freeze Detected' :
                                         audioData.vocal_status === 'stalling' ? 'Unusual Pause / Stalling' :
                                         audioData.vocal_status === 'thinking' ? 'Thinking...' :
                                         'Great Fluency'}
                                    </div>
                                    {audioData.silence_streak && audioData.silence_streak > 1 && (
                                        <p className="text-[8px] text-gray-600 mt-2 text-center font-bold italic">
                                            Silence: {audioData.silence_streak}s
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Placeholder for future features */}
                    <div className="flex-1 border-2 border-dashed border-white/5 rounded-3xl flex items-center justify-center opacity-10">
                        <p className="text-[8px] font-black uppercase tracking-widest italic">+ Add Module</p>
                    </div>

                </div>
            </div>
        </div>
    );
}
