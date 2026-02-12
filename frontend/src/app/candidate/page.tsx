'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useSearchParams } from 'next/navigation';
import { Camera, ShieldCheck, Zap } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function CandidateContent() {
    const searchParams = useSearchParams();
    const [roomId, setRoomId] = useState('');
    const [hasJoined, setHasJoined] = useState(false);
    const { localStream, remoteStream, startCall, socket } = useWebRTC(roomId, false, hasJoined);
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sessionIdRef = useRef<string>('');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const hasJoinedRef = useRef(false);

    useEffect(() => {
        hasJoinedRef.current = hasJoined;
    }, [hasJoined]);

    // 1. Initialize individual session ID
    useEffect(() => {
        sessionIdRef.current = Math.random().toString(36).substring(2, 15);
        
        const roomParam = searchParams.get('room');
        if (roomParam) setRoomId(roomParam);
    }, [searchParams]);

    // 2. Navigation / Termination is now handled by usage of windows.location.reload 
    // in the useWebRTC hook for room_terminated event.

    useEffect(() => {
        if (videoRef.current && localStream) {
            videoRef.current.srcObject = localStream;
            videoRef.current.play().catch(e => console.error("Local video play failed:", e));
        }
    }, [localStream, hasJoined]);

    // Cleanup session on exit
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (hasJoined) {
                const data = JSON.stringify({ session_id: sessionIdRef.current });
                navigator.sendBeacon(`${API_BASE_URL}/end_session`, new Blob([data], { type: 'application/json' }));
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasJoined]);

    const handleJoin = async () => {
        if (!roomId) return alert('Please enter a Room ID');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            
            // Set up MediaRecorder for Audio
            const audioStream = new MediaStream(stream.getAudioTracks());
            const recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
            
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            recorder.onstop = async () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                audioChunksRef.current = [];
                sendAudioToBackend(blob);
            };

            mediaRecorderRef.current = recorder;
            recorder.start();
            
            await startCall(stream);
            setHasJoined(true);
        } catch (err) {
            console.error('Failed to join:', err);
            alert('Could not access camera/mic');
        }
    };

    const sendAudioToBackend = async (blob: Blob) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            const base64Audio = reader.result as string;
            try {
                await fetch(`${API_BASE_URL}/analyze_audio`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        audio: base64Audio,
                        session_id: sessionIdRef.current,
                        room_id: roomId
                    })
                });
            } catch (error) {
                console.error("Audio analysis failed:", error);
            }
        };
    };

    // Audio capture loop (send every 3 seconds)
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (hasJoined) {
            interval = setInterval(() => {
                if (!hasJoinedRef.current) return;
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.stop();
                    mediaRecorderRef.current.start();
                }
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [hasJoined]);

    // Capture and analyze loop (Video)
    useEffect(() => {
        let timeoutId: NodeJS.Timeout;
        
        const captureFrame = async () => {
            if (!hasJoinedRef.current) return;

            if (!videoRef.current || !canvasRef.current) {
                timeoutId = setTimeout(captureFrame, 500);
                return;
            }

            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');

            if (context && video.videoWidth > 0) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = canvas.toDataURL('image/jpeg', 0.6);

                try {
                    await fetch(`${API_BASE_URL}/analyze`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            image: imageData,
                            session_id: sessionIdRef.current,
                            room_id: roomId
                        })
                    });
                    if (hasJoined) timeoutId = setTimeout(captureFrame, 250);
                } catch (error) {
                    console.error("Analysis failed:", error);
                    if (hasJoined) timeoutId = setTimeout(captureFrame, 1000);
                }
            } else {
                timeoutId = setTimeout(captureFrame, 500);
            }
        };

        if (hasJoined) captureFrame();
        return () => { if (timeoutId) clearTimeout(timeoutId); };
    }, [hasJoined, roomId]);

    return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-6 selection:bg-purple-500/30">
            {!hasJoined ? (
                /* Join Screen */
                <div className="w-full max-w-md bg-[#0D0D0D] p-10 rounded-[3rem] border border-white/5 shadow-2xl shadow-purple-500/5 transition-all animate-in fade-in slide-in-from-bottom-5">
                    <div className="w-16 h-16 bg-purple-600/20 rounded-2xl flex items-center justify-center mb-8">
                        <Camera size={28} className="text-purple-500" />
                    </div>
                    <h1 className="text-3xl font-black mb-2 tracking-tight">Join Meeting</h1>
                    <p className="text-white/40 mb-8 text-sm">Enter the invitation code provided to you by your interviewer to begin.</p>
                    
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Room Access Code</label>
                            <input 
                                className="w-full bg-black border border-white/10 px-6 py-4 rounded-2xl focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-lg font-mono tracking-wider outline-none"
                                placeholder="e.g. x2y3z4"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                            />
                        </div>
                        <button 
                            onClick={handleJoin}
                            className="w-full bg-white text-black py-4 rounded-2xl font-black text-lg hover:bg-gray-200 transition-all active:scale-[0.98]"
                        >
                            Enter Interview
                        </button>
                    </div>

                    <div className="mt-8 pt-8 border-t border-white/5 flex items-center gap-4 text-white/20">
                        <div className="flex -space-x-2">
                            <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-black flex items-center justify-center"><ShieldCheck size={10} /></div>
                            <div className="w-6 h-6 rounded-full bg-purple-500/20 border border-black flex items-center justify-center"><Zap size={10} /></div>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest">Secure AI Analysis Enabled</span>
                    </div>
                </div>
            ) : (
                /* Interview Screen (80% Self Video) */
                <div className="w-full h-full flex flex-col items-center justify-center gap-8 animate-in fade-in zoom-in-95 duration-700">
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="relative w-full max-w-[1200px] aspect-video bg-gray-950 rounded-[3rem] overflow-hidden border border-white/10 shadow-2xl">
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted 
                            className="w-full h-full object-cover"
                        />
                        
                        {/* High-impact indicators */}
                        <div className="absolute top-8 left-8 flex items-center gap-4">
                            <div className="bg-black/60 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-3">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                                <span className="text-[10px] font-black uppercase tracking-tighter text-white/80">Connection Stable</span>
                            </div>
                            <button 
                                onClick={() => window.location.reload()}
                                className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95"
                            >
                                Leave Meeting
                            </button>
                        </div>

                        <div className="absolute bottom-8 right-8 flex items-center gap-3">
                            <div className="bg-purple-600/20 backdrop-blur-md px-4 py-2 rounded-2xl border border-purple-500/30">
                                <span className="text-purple-400 text-[9px] font-black uppercase tracking-widest">AI Analysis Active</span>
                            </div>
                            <div className="bg-black/40 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/5">
                                <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">You</span>
                            </div>
                        </div>
                    </div>

                    <div className="max-w-xl text-center">
                        <p className="text-white/40 text-xs italic">
                            "Focus on the camera and speak naturally. Your interviewer can see you and will begin shortly."
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function CandidatePage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-white/20 font-black italic">Loading Workspace...</div>}>
            <CandidateContent />
        </Suspense>
    );
}
