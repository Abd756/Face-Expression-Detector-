import cv2
import cv2
import time
from face_analyzer import FaceAnalyzer

def main():
    # Suppress TensorFlow logs
    import os
    os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
    
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open webcam.")
        return

    analyzer = FaceAnalyzer()
    analyzer.start()

    print("Starting Real-Time Emotion Monitor (Organic Results)... Press 'q' to quit.")

    # Setup the window for full screen
    window_name = 'Emotion Monitor'
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.setWindowProperty(window_name, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        analyzer.process_frame(frame)
        faces_data = analyzer.get_latest_result()

        face_detected = False
        
        if faces_data:
            # DeepFace response handling
            face = faces_data[0]
            
            if 'region' in face and 'emotion' in face:
                face_detected = True
                
                region = face['region']
                emotion_dict = face['emotion']
                dominant_emotion = face['dominant_emotion']
                # Confidence implies face probability in DeepFace context, 
                # but emotion dict values are the emotion probabilities.
                # Let's get the score of the dominant emotion.
                confidence = emotion_dict.get(dominant_emotion, 0.0)

                # Draw bounding box
                x, y, w, h = region['x'], region['y'], region['w'], region['h']
                cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)

                # Show ALL Emotion Probabilities on the left side
                y_offset = 100
                cv2.putText(frame, "Emotion Probabilities:", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
                
                # Sort emotions by score for better visibility
                sorted_emotions = sorted(emotion_dict.items(), key=lambda item: item[1], reverse=True)

                for emo, score in sorted_emotions:
                    text = f"{emo}: {score:.1f}%"
                    
                    # Highlight dominant emotion
                    if emo == dominant_emotion:
                        color_emo = (0, 255, 0) # Green
                        thickness = 2
                    else:
                        color_emo = (200, 200, 200) # Light Gray
                        thickness = 1
                        
                    cv2.putText(frame, text, (20, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color_emo, thickness)
                    y_offset += 25

                # Display Dominant Status prominently
                status_text = f"Current Mood: {dominant_emotion.upper()} ({confidence:.1f}%)"
                cv2.putText(frame, status_text, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

        if not face_detected:
            cv2.putText(frame, "Waiting for face...", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 0, 0), 2)

        cv2.imshow('Emotion Monitor', frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    analyzer.stop()
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
