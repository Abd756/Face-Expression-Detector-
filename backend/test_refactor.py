import requests
import base64
import cv2
import json

def test_analyze():
    url = "http://localhost:8000/analyze"
    
    import numpy as np
    dummy_img = np.zeros((100, 100, 3), dtype=np.uint8)
    _, buffer = cv2.imencode('.jpg', dummy_img)
    
    img_str = base64.b64encode(buffer).decode('utf-8')
    data = {"image": f"data:image/jpeg;base64,{img_str}"}
    
    try:
        response = requests.post(url, json=data)
        print("Response Status:", response.status_code)
        print("Response Body:", response.json())
    except Exception as e:
        print("Error connecting to server:", e)

if __name__ == "__main__":
    test_analyze()
