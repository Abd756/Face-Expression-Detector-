'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useWebRTC } from '@/hooks/useWebRTC';
import { Copy, Users, Video, Mic, Settings } from 'lucide-react';

export default function InterviewerPage() {
    const [roomId, setRoomId] = useState('');
    const [hasJoined, setHasJoined] = useState(false);
    const [aiMetrics, setAiMetrics] = useState({
        gaze: 0,
        stability: 0,
        confidence: 0,
        emotion: 'neutral',
        vocalStatus: 'fluent'
    });
    const [secondsElapsed, setSecondsElapsed] = useState(0);
    
    const { localStream, remoteStream, startCall, socket } = useWebRTC(roomId, true, hasJoined);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    // 1. Generate Room ID on load
    useEffect(() => {
        const id = Math.random().toString(36).substring(2, 9);
        setRoomId(id);
    }, []);

    // 2. Listen for AI Relay
    useEffect(() => {
        if (!socket) return;

        socket.on('ai_results', (data: any) => {
            console.log('RECV AI:', data);
            setAiMetrics(prev => ({
                ...prev,
                gaze: data.gaze_score || 0,
                stability: data.stability_score || 0,
                confidence: data.confidence_score || 0,
                emotion: data.dominant_emotion || 'neutral'
            }));
        });

        socket.on('vocal_results', (data: any) => {
            console.log('RECV VOCAL:', data);
            setAiMetrics(prev => ({
                ...prev,
                vocalStatus: data.vocal_status || 'fluent'
            }));
        });

        return () => {
            socket.off('ai_results');
            socket.off('vocal_results');
        };
    }, [socket]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(e => console.error("Remote video play failed:", e));
        }
    }, [remoteStream, hasJoined]);

    // 3. Meet Timer
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (hasJoined) {
            interval = setInterval(() => {
                setSecondsElapsed(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [hasJoined]);

    const formatTime = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    const handleJoin = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        await startCall(stream);
        setHasJoined(true);
    };

    const copyInvite = () => {
        if (!roomId) return;
        const url = `${window.location.origin}/candidate?room=${roomId}`;
        navigator.clipboard.writeText(url).then(() => {
            alert('Invite link copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy link:', err);
        });
    };

    const handleEndInterview = () => {
        if (confirm('Are you sure you want to end this interview?')) {
            if (socket) {
                console.log('Terminating Room:', roomId);
                socket.emit('terminate_room', { room: roomId });
            }
            // Small delay to ensure message is sent
            setTimeout(() => {
                window.location.reload();
            }, 500);
        }
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-blue-500/30">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 h-16 border-b border-white/5 bg-black/50 backdrop-blur-xl z-50 flex items-center justify-between px-6">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black">AI</div>
                    <span className="font-bold tracking-tight text-lg">Interview Assistant <span className="text-white/40 font-medium text-sm ml-1">Interviewer Mode</span></span>
                </div>
                
                {hasJoined && (
                    <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10">
                        <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Room ID:</span>
                        <code className="text-blue-400 font-mono font-bold">{roomId}</code>
                        <button onClick={copyInvite} className="ml-2 hover:text-blue-400 transition-colors">
                            <Copy size={14} />
                        </button>
                    </div>
                )}
            </header>

            <main className="pt-24 px-6 pb-24 max-w-[1400px] mx-auto h-[calc(100vh-64px)] flex gap-6">
                {/* Left Panel: Video Feed */}
                <div className="flex-1 flex flex-col gap-4">
                    <div className="relative flex-1 bg-gray-900/50 rounded-[2.5rem] border border-white/5 overflow-hidden group shadow-2xl shadow-blue-500/5">
                        <video 
                            ref={remoteVideoRef} 
                            autoPlay 
                            playsInline 
                            className="w-full h-full object-cover rounded-[2.5rem]"
                        />
                        
                        {!remoteStream && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm">
                                <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center mb-4 animate-pulse">
                                    <Users size={32} className="text-blue-500" />
                                </div>
                                <h2 className="text-xl font-bold mb-2">Waiting for Candidate...</h2>
                                <p className="text-white/40 text-sm max-w-xs text-center">Share the invite link with the candidate to begin the analysis session.</p>
                                
                                {!hasJoined && (
                                    <button 
                                        onClick={handleJoin}
                                        className="mt-8 bg-white text-black px-10 py-3 rounded-2xl font-black hover:scale-105 transition-transform shadow-xl shadow-white/10"
                                    >
                                        Start Meeting
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Stream Indicators */}
                        {remoteStream && (
                            <div className="absolute top-6 left-6 flex flex-col gap-2">
                                <span className="bg-red-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                                    Live Analysis
                                </span>
                                <span className="bg-black/50 backdrop-blur-md border border-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                                    Candidate Stream
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Bottom Controls - Only show when joined */}
                    {hasJoined && (
                        <div className="h-20 bg-white/5 rounded-3xl border border-white/5 flex items-center justify-between px-8 animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex gap-4">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Session Active</span>
                            </div>
                            
                            <div className="flex items-center gap-6">
                                <div className="text-right">
                                    <p className="text-[10px] text-white/30 uppercase font-black tracking-widest mb-1">Session Duration</p>
                                    <p className="font-mono font-bold">{formatTime(secondsElapsed)}</p>
                                </div>
                                <button 
                                    onClick={handleEndInterview}
                                    className="bg-red-500 hover:bg-red-600 px-8 h-12 rounded-2xl font-black transition-colors"
                                >
                                    End Interview
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Panel: Metrics/Notes Placeholder */}
                <div className="w-[400px] flex flex-col gap-6">
                    <div className="flex-1 bg-white/5 rounded-[2.5rem] border border-white/5 p-8 flex flex-col gap-6">
                        <h3 className="text-white/40 uppercase text-[10px] font-black tracking-[0.2em]">Real-time Telemetry</h3>
                        
                        <div className="flex flex-col gap-8">
                            {/* Confidence Score */}
                            <div className="flex flex-col items-center justify-center py-6 bg-white/5 rounded-3xl border border-white/5 relative overflow-hidden">
                                <div className="absolute inset-0 bg-blue-600/5 animate-pulse" />
                                <span className="text-[10px] font-black uppercase text-blue-400 mb-2 relative z-10">AI Confidence</span>
                                <span className="text-6xl font-black relative z-10">{Math.round(aiMetrics.confidence)}<span className="text-xl text-white/20">%</span></span>
                            </div>

                            {/* Gaze Score */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                                    <span>Gaze Engagement</span>
                                    <span className={aiMetrics.gaze > 0.7 ? 'text-green-400' : 'text-yellow-400'}>{Math.round(aiMetrics.gaze * 100)}%</span>
                                </div>
                                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-blue-500 transition-all duration-700 ease-out" 
                                        style={{ width: `${aiMetrics.gaze * 100}%` }}
                                    />
                                </div>
                            </div>

                            {/* Stability */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                                    <span>Head Stability</span>
                                    <span className={aiMetrics.stability > 0.8 ? 'text-green-400' : 'text-red-400'}>{Math.round(aiMetrics.stability * 100)}%</span>
                                </div>
                                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-green-500 transition-all duration-700 ease-out" 
                                        style={{ width: `${aiMetrics.stability * 100}%` }}
                                    />
                                </div>
                            </div>

                            {/* Vocal Status */}
                            <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Vocal Status</span>
                                <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                    aiMetrics.vocalStatus === 'fluent' ? 'bg-green-500/20 text-green-400' :
                                    aiMetrics.vocalStatus === 'thinking' ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-red-500/20 text-red-400'
                                }`}>
                                    {aiMetrics.vocalStatus}
                                </span>
                            </div>

                            {/* Emotion */}
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Detected Mood</span>
                                <span className="text-lg font-bold capitalize">{aiMetrics.emotion}</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-[250px] bg-white/5 rounded-[2.5rem] border border-white/5 p-8">
                        <h3 className="text-white/40 uppercase text-[10px] font-black tracking-[0.2em] mb-4">Quick Notes</h3>
                        <textarea 
                            className="w-full h-full bg-transparent border-none focus:ring-0 text-sm text-white/60 placeholder:text-white/10 resize-none"
                            placeholder="Type your observations here..."
                        />
                    </div>
                </div>
            </main>
        </div>
    );
}
