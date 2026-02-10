import cv2
import threading
import queue
import time
from deepface import DeepFace

class FaceAnalyzer:
    def __init__(self):
        self.frame_queue = queue.Queue(maxsize=1)
        self.result_queue = queue.Queue(maxsize=1)
        self.stopped = False
        self.thread = threading.Thread(target=self._worker, daemon=True)
        self.latest_result = None
        self.smoothed_emotions = None # Stores the running average of emotion scores
        self.lock = threading.Lock()

    def start(self):
        self.thread.start()

    def stop(self):
        self.stopped = True
        self.thread.join()

    def process_frame(self, frame):
        if not self.frame_queue.full():
            self.frame_queue.put(frame)

    def get_latest_result(self):
        try:
            result = self.result_queue.get_nowait()
            with self.lock:
                self.latest_result = result
        except queue.Empty:
            pass
        
        with self.lock:
            return self.latest_result

    def _cleanup_loop(self):
        """Removes sessions that haven't been seen for 10 minutes."""
        while not self.stopped:
            time.sleep(60) # Check every minute
            now = time.time()
            with self.lock:
                to_delete = [sid for sid, data in self.sessions.items() 
                             if now - data['last_seen'] > 300] # 300 seconds = 5 minutes
                for sid in to_delete:
                    del self.sessions[sid]

    def analyze_frame_sync(self, frame, session_id="default"):
        """Processes a single frame and returns the smoothed result for a specific session."""
        try:
            # Backend selection:
            detector_backend = 'mediapipe'

            results = DeepFace.analyze(
                img_path=frame, 
                actions=['emotion'], 
                detector_backend=detector_backend, 
                enforce_detection=False,
                silent=True
            )
            
            # Apply Temporal Smoothing (EMA) per session
            if results and len(results) > 0:
                face = results[0]
                current_emotions = face['emotion']
                
                with self.lock:
                    if session_id not in self.sessions:
                        self.sessions[session_id] = {
                            "emotions": current_emotions.copy(),
                            "last_seen": time.time()
                        }
                    
                    session_stats = self.sessions[session_id]
                    session_stats['last_seen'] = time.time()
                    smoothed = session_stats['emotions']
                    
                    alpha = 0.2 
                    for emotion, score in current_emotions.items():
                        previous_score = smoothed.get(emotion, 0)
                        smoothed[emotion] = (score * alpha) + (previous_score * (1 - alpha))
                    
                    face['emotion'] = smoothed.copy()
                    dominant_emotion = max(smoothed, key=smoothed.get)
                    face['dominant_emotion'] = dominant_emotion
                    results[0] = face
            
            return results
        except Exception as e:
            print(f"Analysis Error: {e}")
            return []

    def _worker(self):
        # The worker queue is no longer the main pathway for the API, 
        # but kept for compatibility. It uses the "default" session.
        while not self.stopped:
            try:
                frame = self.frame_queue.get(timeout=1)
            except queue.Empty:
                continue

            results = self.analyze_frame_sync(frame, session_id="default")
            self.result_queue.put(results)
