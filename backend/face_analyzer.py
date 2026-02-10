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

    def analyze_frame_sync(self, frame):
        """Processes a single frame and returns the smoothed result immediately."""
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
            
            # Apply Temporal Smoothing (EMA)
            if results and len(results) > 0:
                face = results[0]
                current_emotions = face['emotion']
                
                with self.lock:
                    if self.smoothed_emotions is None:
                        self.smoothed_emotions = current_emotions.copy()
                    else:
                        alpha = 0.2 
                        for emotion, score in current_emotions.items():
                            previous_score = self.smoothed_emotions.get(emotion, 0)
                            self.smoothed_emotions[emotion] = (score * alpha) + (previous_score * (1 - alpha))
                    
                    face['emotion'] = self.smoothed_emotions.copy()
                    dominant_emotion = max(self.smoothed_emotions, key=self.smoothed_emotions.get)
                    face['dominant_emotion'] = dominant_emotion
                    results[0] = face
            
            return results
        except Exception as e:
            print(f"Analysis Error: {e}")
            return []

    def _worker(self):
        # Keep worker for background processing if needed, 
        # but analyze_frame_sync is preferred for API usage.
        while not self.stopped:
            try:
                frame = self.frame_queue.get(timeout=1)
            except queue.Empty:
                continue

            results = self.analyze_frame_sync(frame)
            self.result_queue.put(results)
