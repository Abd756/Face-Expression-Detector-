'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const useWebRTC = (roomId: string, isInterviewer: boolean, enabled: boolean = false) => {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [socket, setSocket] = useState<Socket | null>(null);
    const peerRef = useRef<RTCPeerConnection | null>(null);
    const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);

    // Use Refs to avoid stale closures in socket listeners
    const roomIdRef = useRef(roomId);
    const isInterviewerRef = useRef(isInterviewer);
    const enabledRef = useRef(enabled);
    const localStreamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        roomIdRef.current = roomId;
        isInterviewerRef.current = isInterviewer;
        enabledRef.current = enabled;
    }, [roomId, isInterviewer, enabled]);

    // Update localStreamRef when localStream changes
    useEffect(() => {
        localStreamRef.current = localStream;
    }, [localStream]);

    useEffect(() => {
        // 1. Initialize Socket Immediately (Persistent)
        console.log('--- WEBRTC Hub Active ---');
        console.log('Attempting connection...');

        const s = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 10,
            timeout: 20000
        });

        s.on('connect_error', (err) => {
            console.error('Socket Connection Error:', err.message);
        });

        s.on('connect', () => {
            console.log('Connected to Signaling Server:', s.id);
            if (roomIdRef.current && enabledRef.current) {
                s.emit('join_room', { room: roomIdRef.current });
            }
        });

        s.on('offer', async (data) => {
            if (isInterviewerRef.current && enabledRef.current) {
                console.log('Interviewer: Received Offer');
                await handleOffer(data.offer, s);
            }
        });

        s.on('answer', async (data) => {
            if (enabledRef.current) {
                console.log('Received Answer');
                if (peerRef.current) {
                    await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
                    while (iceQueueRef.current.length > 0) {
                        const candidate = iceQueueRef.current.shift();
                        if (candidate) await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                    }
                }
            }
        });

        s.on('ice_candidate', async (data) => {
            if (!enabledRef.current) return;
            if (peerRef.current && peerRef.current.remoteDescription) {
                try {
                    await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) { console.error('ICE Error', e); }
            } else {
                iceQueueRef.current.push(data.candidate);
            }
        });

        s.on('room_terminated', () => {
            if (enabledRef.current) {
                console.log('Room terminated by interviewer');
                alert('The interview session has been ended.');
                window.location.reload();
            }
        });

        s.on('user_joined', () => {
            console.log('New user joined the room');
            if (!isInterviewerRef.current && localStreamRef.current && enabledRef.current) {
                console.log('Candidate: Detected joiner, sending fresh offer...');
                startCall(localStreamRef.current);
            }
        });

        setSocket(s);

        return () => {
            s.disconnect();
            peerRef.current?.close();
            localStream?.getTracks().forEach(t => t.stop());
        };
    }, []); // Persistent socket

    // 2. Handle joining/leaving logic when RoomId or Enabled changes
    useEffect(() => {
        if (socket && socket.connected && roomId && enabled) {
            console.log('Joining Room:', roomId);
            socket.emit('join_room', { room: roomId });
        }
    }, [socket, roomId, enabled]);

    const initPeer = (s: Socket) => {
        if (peerRef.current) return peerRef.current;

        console.log('Initializing PC');
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        pc.onicecandidate = (event) => {
            if (event.candidate && enabledRef.current) {
                s.emit('ice_candidate', {
                    room: roomIdRef.current,
                    candidate: event.candidate
                });
            }
        };

        pc.ontrack = (event) => {
            console.log('Received Remote Track:', event.track.kind);
            if (event.streams && event.streams[0]) {
                setRemoteStream(event.streams[0]);
            } else {
                // Fallback for some browsers
                setRemoteStream(new MediaStream([event.track]));
            }
        };

        peerRef.current = pc;
        return pc;
    };

    const startCall = async (stream: MediaStream) => {
        if (!socket) {
            console.error('Socket not ready for startCall');
            return;
        }
        setLocalStream(stream);
        const pc = initPeer(socket);

        // Only add tracks if they don't exist
        const senders = pc.getSenders();
        stream.getTracks().forEach(track => {
            if (!senders.find(s => s.track === track)) {
                pc.addTrack(track, stream);
            }
        });

        // Candidate initiates the offer
        if (!isInterviewerRef.current) {
            console.log('Candidate: Generating Offer');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { room: roomIdRef.current, offer });
        }
    };

    const handleOffer = async (offer: RTCSessionDescriptionInit, s: Socket) => {
        console.log('Handling Offer');
        const pc = initPeer(s);

        // If interviewer had a stream (for two-way), we'd add it here
        // For now, interviewer just receives candidate feed

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        s.emit('answer', { room: roomIdRef.current, answer });

        // Process queued ICE candidates
        while (iceQueueRef.current.length > 0) {
            const candidate = iceQueueRef.current.shift();
            if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    };

    return { localStream, remoteStream, startCall, socket };
};
