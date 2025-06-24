from flask import Flask, jsonify, request, make_response
from flask_cors import CORS

app = Flask(__name__)

# Simple CORS setup
CORS(app, 
     origins=['http://localhost:8082', 'http://localhost:8081'],
     supports_credentials=True,
     allow_headers=['Content-Type', 'Authorization'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])

@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    allowed_origins = ['http://localhost:8081', 'http://localhost:8082']
    
    if origin in allowed_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    
    return response

@app.route('/api/test', methods=['GET', 'OPTIONS'])
def test():
    return jsonify({
        'success': True,
        'message': 'CORS is working!',
        'origin': request.headers.get('Origin', 'No origin')
    })

@app.route('/api/analysis/dashboard', methods=['GET', 'OPTIONS'])
def dashboard():
    return jsonify({
        'success': True,
        'data': {
            'totalDocuments': 15,
            'recentUploads': 4,
            'chatSessions': 8,
            'processingFiles': 2
        }
    })

if __name__ == '__main__':
    print("Starting CORS test server on port 5001...")
    app.run(debug=True, port=5001, host='0.0.0.0') 