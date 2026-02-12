'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useWebRTC } from '@/hooks/useWebRTC';
import { Camera, Video } from 'lucide-react';

export default function WebRTCTest() {
    const [roomId, setRoomId] = useState('test-room');
    const [isInterviewer, setIsInterviewer] = useState(false);
    const { localStream, remoteStream, startCall } = useWebRTC(roomId, isInterviewer);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    const handleStart = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        startCall(stream);
    };

    return (
        <div className="min-h-screen bg-black text-white p-8 flex flex-col items-center gap-8">
            <h1 className="text-4xl font-black">WebRTC Bridge Test</h1>
            
            <div className="flex gap-4 bg-gray-900 p-6 rounded-3xl border border-white/10">
                <input 
                    className="bg-black border border-white/20 px-4 py-2 rounded-xl"
                    placeholder="Enter Room ID"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                />
                <button 
                    onClick={() => setIsInterviewer(!isInterviewer)}
                    className={`px-6 py-2 rounded-xl font-bold transition-all ${isInterviewer ? 'bg-blue-600' : 'bg-green-600'}`}
                >
                    Role: {isInterviewer ? 'Interviewer' : 'Candidate'}
                </button>
                <button 
                    onClick={handleStart}
                    className="bg-white text-black px-8 py-2 rounded-xl font-black hover:bg-gray-200"
                >
                    Join & Start
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl">
                <div className="relative aspect-video bg-gray-950 rounded-[2rem] overflow-hidden border border-white/5">
                    <span className="absolute top-4 left-4 z-10 bg-black/50 px-3 py-1 rounded-full text-[10px] uppercase font-bold">Local Stream</span>
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                </div>
                
                <div className="relative aspect-video bg-gray-950 rounded-[2rem] overflow-hidden border border-white/5">
                    <span className="absolute top-4 left-4 z-10 bg-black/50 px-3 py-1 rounded-full text-[10px] uppercase font-bold">Remote Stream (Candidate's Feed)</span>
                    <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    {!remoteStream && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-20">
                            <Video size={64} />
                        </div>
                    )}
                </div>
            </div>

            <div className="text-gray-500 text-sm max-w-lg text-center">
                <p>Open this page in two different tabs/browsers. Set one to <b>Interviewer</b> and one to <b>Candidate</b>. Use the <b>same Room ID</b> to test the connection.</p>
            </div>
        </div>
    );
}
