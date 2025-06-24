#!/usr/bin/env python3
"""
Test script for mobile API endpoints
Tests all v1/mobile endpoints to ensure they're working correctly
"""

import requests
import json
import sys
import time

# Configuration
BASE_URL = "http://localhost:5000"
MOBILE_BASE_URL = f"{BASE_URL}/api/v1/mobile"

class MobileAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'X-Platform': 'ios',  # Use 'ios' or 'android' for testing
            'User-Agent': 'GrabDocs-Mobile/1.0.0'
        })
        self.test_user = {
            'username': 'mobile_test_user',
            'email': 'mobile.test@example.com',
            'password': 'test123456',
            'firstName': 'Mobile',
            'lastName': 'Tester'
        }
        
    def log(self, message, status="INFO"):
        timestamp = time.strftime("%H:%M:%S")
        print(f"[{timestamp}] {status}: {message}")
        
    def test_endpoint(self, method, endpoint, data=None, expected_status=200):
        """Test a single endpoint"""
        url = f"{MOBILE_BASE_URL}{endpoint}"
        self.log(f"Testing {method} {endpoint}")
        
        try:
            if method.upper() == 'GET':
                response = self.session.get(url)
            elif method.upper() == 'POST':
                response = self.session.post(url, json=data)
            elif method.upper() == 'PUT':
                response = self.session.put(url, json=data)
            elif method.upper() == 'DELETE':
                response = self.session.delete(url)
            else:
                self.log(f"Unsupported method: {method}", "ERROR")
                return False
                
            self.log(f"Response: {response.status_code} - {response.reason}")
            
            if response.status_code == expected_status:
                self.log(f"✅ {endpoint} - SUCCESS", "PASS")
                return True
            else:
                self.log(f"❌ {endpoint} - Expected {expected_status}, got {response.status_code}", "FAIL")
                if response.text:
                    self.log(f"Response: {response.text[:200]}", "DEBUG")
                return False
                
        except Exception as e:
            self.log(f"❌ {endpoint} - Exception: {str(e)}", "ERROR")
            return False
            
    def test_health_check(self):
        """Test basic server health"""
        self.log("Testing server health...")
        try:
            response = requests.get(f"{BASE_URL}/health")
            if response.status_code == 200:
                self.log("✅ Server is healthy", "PASS")
                return True
            else:
                self.log("❌ Server health check failed", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ Cannot connect to server: {e}", "ERROR")
            return False
            
    def run_authentication_tests(self):
        """Test authentication endpoints"""
        self.log("\n=== TESTING AUTHENTICATION ENDPOINTS ===")
        
        tests = [
            # Auth check (should fail - not logged in)
            ('GET', '/auth-check', None, 401),
            
            # Signup
            ('POST', '/signup', self.test_user, 201),
            
            # Login
            ('POST', '/login', {
                'username': self.test_user['username'],
                'password': self.test_user['password']
            }, 200),
            
            # Auth check (should pass now)
            ('GET', '/auth-check', None, 200),
            
            # Forgot password
            ('POST', '/forgot-password', {
                'email': self.test_user['email']
            }, 200),
        ]
        
        passed = 0
        for method, endpoint, data, expected_status in tests:
            if self.test_endpoint(method, endpoint, data, expected_status):
                passed += 1
                
        self.log(f"Authentication tests: {passed}/{len(tests)} passed")
        return passed == len(tests)
        
    def run_user_tests(self):
        """Test user management endpoints"""
        self.log("\n=== TESTING USER MANAGEMENT ENDPOINTS ===")
        
        tests = [
            # Get user profile
            ('GET', '/user', None, 200),
            
            # Update user profile
            ('PUT', '/user', {
                'firstName': 'Updated',
                'lastName': 'Name'
            }, 200),
        ]
        
        passed = 0
        for method, endpoint, data, expected_status in tests:
            if self.test_endpoint(method, endpoint, data, expected_status):
                passed += 1
                
        self.log(f"User management tests: {passed}/{len(tests)} passed")
        return passed == len(tests)
        
    def run_file_tests(self):
        """Test file management endpoints"""
        self.log("\n=== TESTING FILE MANAGEMENT ENDPOINTS ===")
        
        tests = [
            # Get files
            ('GET', '/files', None, 200),
            
            # Get files with pagination
            ('GET', '/files?page=1&perPage=10', None, 200),
        ]
        
        passed = 0
        for method, endpoint, data, expected_status in tests:
            if self.test_endpoint(method, endpoint, data, expected_status):
                passed += 1
                
        self.log(f"File management tests: {passed}/{len(tests)} passed")
        return passed == len(tests)
        
    def run_chat_tests(self):
        """Test chat endpoints"""
        self.log("\n=== TESTING CHAT ENDPOINTS ===")
        
        tests = [
            # Get chat history
            ('GET', '/chat/history', None, 200),
            
            # Send chat message
            ('POST', '/chat/send', {
                'message': 'Hello from mobile test!'
            }, 200),
        ]
        
        passed = 0
        for method, endpoint, data, expected_status in tests:
            if self.test_endpoint(method, endpoint, data, expected_status):
                passed += 1
                
        self.log(f"Chat tests: {passed}/{len(tests)} passed")
        return passed == len(tests)
        
    def run_forms_tests(self):
        """Test forms endpoints"""
        self.log("\n=== TESTING FORMS ENDPOINTS ===")
        
        tests = [
            # Get forms
            ('GET', '/forms', None, 200),
            
            # Create form
            ('POST', '/forms', {
                'name': 'Mobile Test Form',
                'description': 'A test form created from mobile API',
                'fields': [
                    {
                        'id': 'field1',
                        'type': 'text',
                        'label': 'Name',
                        'required': True
                    }
                ]
            }, 201),
        ]
        
        passed = 0
        for method, endpoint, data, expected_status in tests:
            if self.test_endpoint(method, endpoint, data, expected_status):
                passed += 1
                
        self.log(f"Forms tests: {passed}/{len(tests)} passed")
        return passed == len(tests)
        
    def run_analytics_tests(self):
        """Test analytics endpoints"""
        self.log("\n=== TESTING ANALYTICS ENDPOINTS ===")
        
        tests = [
            # Get dashboard stats
            ('GET', '/analysis/dashboard', None, 200),
            
            # Get analytics
            ('GET', '/analysis/analytics', None, 200),
            
            # Get activity
            ('GET', '/analysis/activity', None, 200),
        ]
        
        passed = 0
        for method, endpoint, data, expected_status in tests:
            if self.test_endpoint(method, endpoint, data, expected_status):
                passed += 1
                
        self.log(f"Analytics tests: {passed}/{len(tests)} passed")
        return passed == len(tests)
        
    def run_documents_tests(self):
        """Test documents endpoints"""
        self.log("\n=== TESTING DOCUMENTS ENDPOINTS ===")
        
        tests = [
            # Get documents
            ('GET', '/documents', None, 200),
        ]
        
        passed = 0
        for method, endpoint, data, expected_status in tests:
            if self.test_endpoint(method, endpoint, data, expected_status):
                passed += 1
                
        self.log(f"Documents tests: {passed}/{len(tests)} passed")
        return passed == len(tests)
        
    def run_templates_tests(self):
        """Test templates endpoints"""
        self.log("\n=== TESTING TEMPLATES ENDPOINTS ===")
        
        tests = [
            # Get templates
            ('GET', '/templates', None, 200),
        ]
        
        passed = 0
        for method, endpoint, data, expected_status in tests:
            if self.test_endpoint(method, endpoint, data, expected_status):
                passed += 1
                
        self.log(f"Templates tests: {passed}/{len(tests)} passed")
        return passed == len(tests)
        
    def cleanup(self):
        """Logout and cleanup"""
        self.log("\n=== CLEANUP ===")
        self.test_endpoint('POST', '/logout', None, 200)
        
    def run_all_tests(self):
        """Run all test suites"""
        self.log("🚀 Starting Mobile API Endpoint Tests")
        self.log(f"Base URL: {MOBILE_BASE_URL}")
        
        # Check server health first
        if not self.test_health_check():
            self.log("❌ Server is not healthy, aborting tests", "ERROR")
            return False
            
        total_passed = 0
        total_tests = 8
        
        # Run all test suites
        test_results = [
            self.run_authentication_tests(),
            self.run_user_tests(),
            self.run_file_tests(),
            self.run_chat_tests(),
            self.run_forms_tests(),
            self.run_analytics_tests(),
            self.run_documents_tests(),
            self.run_templates_tests(),
        ]
        
        # Cleanup
        self.cleanup()
        
        # Summary
        passed_suites = sum(test_results)
        self.log(f"\n🏁 TEST SUMMARY")
        self.log(f"Test suites passed: {passed_suites}/{total_tests}")
        
        if passed_suites == total_tests:
            self.log("🎉 ALL TESTS PASSED! Mobile API is ready for production!", "SUCCESS")
            return True
        else:
            self.log(f"⚠️  {total_tests - passed_suites} test suite(s) failed", "WARNING")
            return False

def main():
    """Main test runner"""
    tester = MobileAPITester()
    
    try:
        success = tester.run_all_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️  Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Test runner failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 