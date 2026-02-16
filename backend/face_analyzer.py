import cv2
import threading
import queue
import time
import numpy as np

class FaceAnalyzer:
    def __init__(self):
        self.frame_queue = queue.Queue(maxsize=1)
        self.result_queue = queue.Queue(maxsize=1)
        self.stopped = False
        self.thread = threading.Thread(target=self._worker, daemon=True)
        self.latest_result = None
        
        # sessions structure holds: 
        # {session_id: {"emotions": {}, "last_head_pos": (x,y), "stability_history": [], "last_seen": timestamp}}
        self.sessions = {} 
        self.lock = threading.Lock()
        
        # Initialize MediaPipe Face Mesh
        import mediapipe as mp
        import os
        
        # Suppress MediaPipe/GLog noise
        os.environ['GLOG_logtostderr'] = '0'
        os.environ['GLOG_minloglevel'] = '2'
        
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )

        # Cleanup thread
        self.cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self.cleanup_thread.start()

    def start(self):
        self.thread.start()

    def stop(self):
        self.stopped = True
        if self.thread.is_alive():
            self.thread.join()

    def _cleanup_loop(self):
        """Removes sessions that haven't been seen for 2 minutes."""
        while not self.stopped:
            time.sleep(60)
            now = time.time()
            with self.lock:
                to_delete = [sid for sid, data in self.sessions.items() 
                             if now - data['last_seen'] > 120]
                for sid in to_delete:
                    del self.sessions[sid]
                    import gc
                    gc.collect()

    def analyze_frame_sync(self, frame, session_id="default"):
        """Processes a single frame for emotions, gaze, and stability."""
        try:
            results_data = {
                "detected": False,
                "emotions": {},
                "dominant_emotion": None,
                "gaze_score": 0,    # 0 to 1, 1 is center
                "stability_score": 0 # 0 to 1, 1 is steady
            }

            # 1. MediaPipe Analysis (Gaze & Stability)
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_results = self.face_mesh.process(rgb_frame)

            if mp_results.multi_face_landmarks:
                results_data["detected"] = True
                face_landmarks = mp_results.multi_face_landmarks[0].landmark
                h, w, _ = frame.shape

                # --- Gaze Detection (Simplified Iris tracking) ---
                # Left Iris: 468, Right Iris: 473
                # Left Eye Corners: 33, 133 | Right Eye Corners: 362, 263
                def get_gaze_ratio(iris_idx, l_corner_idx, r_corner_idx):
                    iris = face_landmarks[iris_idx]
                    l_c = face_landmarks[l_corner_idx]
                    r_c = face_landmarks[r_corner_idx]
                    
                    # Calculate relative horizontal position of iris in eye
                    eye_width = abs(r_c.x - l_c.x)
                    if eye_width == 0: return 0.5
                    ratio = (iris.x - l_c.x) / eye_width
                    return ratio

                left_ratio = get_gaze_ratio(468, 33, 133)
                right_ratio = get_gaze_ratio(473, 362, 263)
                avg_ratio = (left_ratio + right_ratio) / 2
                
                # Center is 0.5. Calculate distance from center.
                gaze_dist = abs(avg_ratio - 0.5)
                # Map 0 dist to 1.0 score, and 0.2+ dist to 0.0 score
                results_data["gaze_score"] = max(0, 1 - (gaze_dist / 0.15))

                # --- Stability Detection (Head jitter) ---
                # Use Nose Tip (landmark 1) as a proxy for head position
                nose = face_landmarks[1]
                curr_pos = (nose.x, nose.y)

                with self.lock:
                    if session_id not in self.sessions:
                        self.sessions[session_id] = {
                            "emotions": {},
                            "last_head_pos": curr_pos,
                            "stability_history": [1.0] * 10,
                            "last_seen": time.time()
                        }
                    
                    session = self.sessions[session_id]
                    session["last_seen"] = time.time()
                    
                    # Robustness: Lazy initialize if session was created by audio
                    if "stability_history" not in session:
                        session["stability_history"] = [1.0] * 10
                    if "last_head_pos" not in session:
                        session["last_head_pos"] = curr_pos

                    prev_pos = session.get("last_head_pos", curr_pos)
                    # Calculate displacement
                    movement = np.sqrt((curr_pos[0] - prev_pos[0])**2 + (curr_pos[1] - prev_pos[1])**2)
                    
                    # Convert movement to a 0-1 stability score (lower movement = higher stability)
                    # Sensitivity factor: 0.05 is a significant jump
                    curr_stability = max(0, 1 - (movement / 0.03))
                    
                    # Smoothing
                    session["stability_history"].append(curr_stability)
                    if len(session["stability_history"]) > 15:
                        session["stability_history"].pop(0)
                    
                    results_data["stability_score"] = np.mean(session["stability_history"])
                    session["last_head_pos"] = curr_pos

                # 2. DeepFace Analysis (Emotions)
                try:
                    from deepface import DeepFace
                    emotion_results = DeepFace.analyze(
                        img_path=frame, 
                        actions=['emotion'], 
                        detector_backend='mediapipe', 
                        enforce_detection=False,
                        silent=True
                    )
                except Exception as df_err:
                    print(f"DeepFace Analysis Error: {df_err}")
                    emotion_results = []

                if emotion_results and len(emotion_results) > 0:
                    face = emotion_results[0]
                    current_emotions = face['emotion']
                    
                    with self.lock:
                        # Smoothing emotions (EMA)
                        session = self.sessions[session_id]
                        if not session["emotions"]:
                            session["emotions"] = current_emotions.copy()
                        
                        smoothed = session["emotions"]
                        alpha = 0.2 
                        for emotion, score in current_emotions.items():
                            previous_score = smoothed.get(emotion, 0)
                            smoothed[emotion] = (score * alpha) + (previous_score * (1 - alpha))
                        
                        results_data["emotions"] = smoothed.copy()
                        results_data["dominant_emotion"] = max(smoothed, key=smoothed.get)

            return [results_data] if results_data["detected"] else []

        except Exception as e:
            print(f"Analysis Error: {e}")
            return []

    def _worker(self):
        while not self.stopped:
            try:
                frame = self.frame_queue.get(timeout=1)
            except queue.Empty:
                continue

            results = self.analyze_frame_sync(frame, session_id="default")
            self.result_queue.put(results)
