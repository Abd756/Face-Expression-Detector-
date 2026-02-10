'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, StopCircle, RefreshCw, BarChart2, Video } from 'lucide-react';

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

export default function EmotionTest() {
    const [isStreaming, setIsStreaming] = useState(false);
    const [data, setData] = useState<AnalysisData | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Start local camera
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setIsStreaming(true);
        } catch (error) {
            console.error("Failed to access camera:", error);
            alert("Could not access camera. Please ensure permissions are granted.");
        }
    };

    // Stop camera and release tracks
    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setIsStreaming(false);
        setData(null);
    };

    // Capture and analyze loop
    useEffect(() => {
        let interval: NodeJS.Timeout;
        
        const captureFrame = async () => {
            if (!isStreaming || !videoRef.current || !canvasRef.current) return;

            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');

            if (context && video.videoWidth > 0) {
                // Match canvas size to video
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Draw current frame to canvas
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                // Convert to Base64 (low quality JPEG to save bandwidth)
                const imageData = canvas.toDataURL('image/jpeg', 0.6);

                try {
                    const response = await fetch(`${API_BASE_URL}/analyze`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ image: imageData })
                    });
                    const result = await response.json();
                    setData(result);
                } catch (error) {
                    console.error("Analysis request failed:", error);
                }
            }
        };

        if (isStreaming) {
            interval = setInterval(captureFrame, 500); // Analyze every 500ms
        }
        
        return () => clearInterval(interval);
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
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white p-6">
            <header className="mb-8 text-center">
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
                    Real-Time Emotion Monitor
                </h1>
                <p className="text-gray-400 mt-2">Powered by DeepFace & MediaPipe</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-6xl">
                
                <div className="flex flex-col items-center gap-4">
                    <div className="relative w-full aspect-video bg-gray-950 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden flex items-center justify-center group">
                        {/* Hidden canvas for snapshotting */}
                        <canvas ref={canvasRef} className="hidden" />
                        
                        {/* Local Video Element */}
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover ${isStreaming ? 'block' : 'hidden'}`}
                        />

                        {!isStreaming && (
                            <div className="text-center p-10 opacity-50">
                                <Video size={64} className="mx-auto mb-4 text-gray-600" />
                                <p className="text-xl font-medium text-gray-500">Camera is Offline</p>
                            </div>
                        )}
                        
                        <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                            <div className={`w-3 h-3 rounded-full ${isStreaming ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                            <span className="text-xs font-semibold tracking-wider uppercase">
                                {isStreaming ? "Live Analysis" : "Offline"}
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        {!isStreaming ? (
                            <button
                                onClick={startCamera}
                                className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all shadow-lg shadow-blue-900/20 active:scale-95"
                            >
                                <Camera size={20} />
                                Start Camera
                            </button>
                        ) : (
                            <button
                                onClick={stopCamera}
                                className="flex items-center gap-2 px-8 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold transition-all shadow-lg shadow-red-900/20 active:scale-95"
                            >
                                <StopCircle size={20} />
                                Stop Camera
                            </button>
                        )}
                    </div>
                </div>

                <div className="bg-gray-800/50 backdrop-blur-sm border border-white/10 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
                        <div className="flex items-center gap-3">
                            <BarChart2 className="text-blue-400" />
                            <h2 className="text-xl font-bold">Emotion Analysis</h2>
                        </div>
                        {isStreaming && (
                            <span className="text-xs text-gray-400 font-mono animate-pulse">
                                {data?.detected ? 'Analyzing...' : 'Waiting for Face...'}
                            </span>
                        )}
                    </div>

                    {!isStreaming || !data ? (
                        <div className="h-64 flex flex-col items-center justify-center text-gray-500">
                             <RefreshCw className={`mb-3 opacity-50 ${isStreaming ? 'animate-spin' : ''}`} size={32} />
                             <p>{isStreaming ? "Connecting to backend..." : "Start camera to view data"}</p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <div className="bg-black/20 rounded-xl p-4 text-center border border-white/5">
                                <p className="text-gray-400 text-sm uppercase tracking-widest mb-1">Current Mood</p>
                                <div className="text-4xl font-extrabold text-white">
                                    {data.dominant_emotion ? data.dominant_emotion.toUpperCase() : "N/A"}
                                </div>
                                {data.detected ? (
                                    <span className="text-green-400 text-sm font-medium">Face Detected</span>
                                ) : (
                                    <span className="text-red-400 text-sm font-medium">No Face Detected</span>
                                )}
                            </div>

                            <div className="space-y-3">
                                {data.emotions && emotionList.map((emo) => {
                                    const score = data.emotions![emo] || 0;
                                    const isDominant = emo === data.dominant_emotion;
                                    return (
                                        <div key={emo} className="group">
                                            <div className="flex justify-between text-xs font-semibold uppercase mb-1 text-gray-400 group-hover:text-white transition-colors">
                                                <span>{emo}</span>
                                                <span>{score.toFixed(1)}%</span>
                                            </div>
                                            <div className="h-2 w-full bg-gray-700/50 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-300 ease-out ${getBarColor(emo)} ${isDominant ? 'opacity-100 shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'opacity-70'}`}
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
            </div>
        </div>
    );
}
