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

    def _worker(self):
        while not self.stopped:
            try:
                frame = self.frame_queue.get(timeout=1)
            except queue.Empty:
                continue

            try:
                # Backend selection:
                # 'retinaface': High accuracy, Slow (Low FPS on CPU)
                # 'mediapipe': High accuracy, Very Fast (High FPS on CPU)
                # 'opencv': Low accuracy, Fast
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
                    
                    if self.smoothed_emotions is None:
                        # First frame, initialize directly
                        self.smoothed_emotions = current_emotions.copy()
                    else:
                        # Blend current with previous (Alpha = 0.2 means 20% new, 80% old)
                        # This makes changes smooth, not instant.
                        alpha = 0.2 
                        for emotion, score in current_emotions.items():
                            previous_score = self.smoothed_emotions.get(emotion, 0)
                            # EMA Formula: New = (Current * alpha) + (Previous * (1 - alpha))
                            self.smoothed_emotions[emotion] = (score * alpha) + (previous_score * (1 - alpha))
                    
                    # Update the result with smoothed values
                    face['emotion'] = self.smoothed_emotions
                    
                    # Recalculate dominant emotion based on smoothed scores
                    dominant_emotion = max(self.smoothed_emotions, key=self.smoothed_emotions.get)
                    face['dominant_emotion'] = dominant_emotion
                    
                    results[0] = face

                self.result_queue.put(results)
            except Exception as e:
                # print(f"Analysis Error: {e}") # Optional: Uncomment for debugging
                self.result_queue.put([])
