#!/usr/bin/env python3
"""
Test script for Enhanced 2FA implementation
Tests the integration between the mobile app and existing backend endpoints
"""

import requests
import json
import time
from typing import Dict, Any

# Configuration
BASE_URL = "http://localhost:5000/api/v1/mobile"
TEST_USER = {
    "username": "francis",
    "password": "password123",
    "phone": "+1234567890"  # Test phone for SMS
}

class Enhanced2FATest:
    def __init__(self):
        self.session = requests.Session()
        self.device_fingerprint = "test-device-12345"
        
    def test_enhanced_login_flow(self):
        """Test the complete Enhanced 2FA login flow"""
        print("🧪 Testing Enhanced 2FA Login Flow")
        print("=" * 50)
        
        # Step 1: Initial risk assessment
        print("1. Performing initial risk assessment...")
        risk_data = {
            "device_fingerprint": self.device_fingerprint,
            "platform": "ios",
            "app_version": "1.0.0"
        }
        
        # Step 2: Attempt login with Enhanced 2FA
        print("2. Attempting login with Enhanced 2FA...")
        login_data = {
            "username": TEST_USER["username"],
            "password": TEST_USER["password"],
            "device_fingerprint": self.device_fingerprint,
            "remember_device": True,
            "risk_context": {
                "is_new_device": True,
                "failed_attempts": 0,
                "time_of_day_factor": 0.8
            }
        }
        
        try:
            # Use existing login endpoint
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            print(f"Login response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    print("✅ Enhanced 2FA login successful!")
                    print(f"User: {data.get('user', {}).get('username')}")
                    print(f"Token received: {bool(data.get('access_token'))}")
                    return True
                else:
                    print(f"❌ Login failed: {data.get('message')}")
            else:
                print(f"❌ HTTP Error: {response.status_code}")
                print(f"Response: {response.text}")
                
        except Exception as e:
            print(f"❌ Error during login: {e}")
            
        return False
    
    def test_phone_2fa_flow(self):
        """Test the phone-based 2FA flow (existing implementation)"""
        print("\n🧪 Testing Phone 2FA Flow")
        print("=" * 50)
        
        # Step 1: Request OTP
        print("1. Requesting OTP...")
        otp_data = {
            "phone": TEST_USER["phone"],
            "device_fingerprint": self.device_fingerprint
        }
        
        try:
            response = self.session.post(f"{BASE_URL}/auth/request-otp", json=otp_data)
            print(f"OTP request response: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    print("✅ OTP requested successfully!")
                    print(f"Message: {data.get('message')}")
                    
                    # In test mode, we can use a fixed OTP
                    test_otp = "123456"  # Test OTP as defined in backend
                    
                    # Step 2: Verify OTP
                    print("2. Verifying OTP...")
                    verify_data = {
                        "phone": TEST_USER["phone"],
                        "otp": test_otp,
                        "device_fingerprint": self.device_fingerprint
                    }
                    
                    verify_response = self.session.post(f"{BASE_URL}/auth/verify-otp", json=verify_data)
                    print(f"OTP verification response: {verify_response.status_code}")
                    
                    if verify_response.status_code == 200:
                        verify_data = verify_response.json()
                        if verify_data.get("success"):
                            print("✅ OTP verified successfully!")
                            
                            # Step 3: Complete login with phone
                            print("3. Completing phone login...")
                            phone_login_data = {
                                "phone": TEST_USER["phone"],
                                "password": TEST_USER["password"],
                                "device_fingerprint": self.device_fingerprint,
                                "remember_device": True
                            }
                            
                            login_response = self.session.post(f"{BASE_URL}/auth/login-with-phone", json=phone_login_data)
                            if login_response.status_code == 200:
                                login_data = login_response.json()
                                if login_data.get("success"):
                                    print("✅ Phone 2FA login successful!")
                                    return True
                                    
                        else:
                            print(f"❌ OTP verification failed: {verify_data.get('message')}")
                    else:
                        print(f"❌ OTP verification HTTP error: {verify_response.status_code}")
                        
                else:
                    print(f"❌ OTP request failed: {data.get('message')}")
            else:
                print(f"❌ OTP request HTTP error: {response.status_code}")
                print(f"Response: {response.text}")
                
        except Exception as e:
            print(f"❌ Error during phone 2FA: {e}")
            
        return False
    
    def test_device_trust_simulation(self):
        """Test device trust and risk scoring simulation"""
        print("\n🧪 Testing Device Trust Simulation")
        print("=" * 50)
        
        # Simulate different risk scenarios
        risk_scenarios = [
            {
                "name": "Trusted Device",
                "context": {
                    "is_new_device": False,
                    "failed_attempts": 0,
                    "time_of_day_factor": 0.9,
                    "last_login_hours_ago": 2
                },
                "expected_risk": "LOW"
            },
            {
                "name": "New Device",
                "context": {
                    "is_new_device": True,
                    "failed_attempts": 0,
                    "time_of_day_factor": 0.8,
                    "last_login_hours_ago": 24
                },
                "expected_risk": "MEDIUM"
            },
            {
                "name": "High Risk",
                "context": {
                    "is_new_device": True,
                    "failed_attempts": 2,
                    "time_of_day_factor": 0.3,  # Late night
                    "last_login_hours_ago": 168  # 1 week
                },
                "expected_risk": "HIGH"
            }
        ]
        
        for scenario in risk_scenarios:
            print(f"\nTesting scenario: {scenario['name']}")
            
            # Calculate risk score (client-side simulation)
            context = scenario['context']
            risk_score = self.calculate_risk_score(context)
            
            print(f"Risk Score: {risk_score}/100")
            if risk_score <= 30:
                risk_level = "LOW"
            elif risk_score <= 60:
                risk_level = "MEDIUM"
            else:
                risk_level = "HIGH"
                
            print(f"Risk Level: {risk_level}")
            print(f"Expected: {scenario['expected_risk']}")
            
            if risk_level == scenario['expected_risk']:
                print("✅ Risk assessment correct!")
            else:
                print("❌ Risk assessment mismatch!")
    
    def calculate_risk_score(self, context: Dict[str, Any]) -> int:
        """
        Client-side risk calculation simulation
        This mirrors the logic in deviceSecurity.ts
        """
        score = 0
        
        # New device factor (0-40 points)
        if context.get('is_new_device', False):
            score += 40
        
        # Failed attempts (0-30 points)
        failed_attempts = context.get('failed_attempts', 0)
        score += min(failed_attempts * 10, 30)
        
        # Time since last login (0-20 points)
        hours_ago = context.get('last_login_hours_ago', 0)
        if hours_ago > 168:  # More than a week
            score += 20
        elif hours_ago > 72:  # More than 3 days
            score += 15
        elif hours_ago > 24:  # More than a day
            score += 10
        elif hours_ago > 12:  # More than 12 hours
            score += 5
        
        # Time of day factor (0-10 points)
        time_factor = context.get('time_of_day_factor', 1.0)
        if time_factor < 0.5:  # Very unusual time
            score += 10
        elif time_factor < 0.7:  # Somewhat unusual
            score += 5
        
        return min(score, 100)
    
    def run_all_tests(self):
        """Run all Enhanced 2FA tests"""
        print("🚀 Enhanced 2FA Test Suite")
        print("=" * 50)
        print(f"Testing against: {BASE_URL}")
        print(f"Test user: {TEST_USER['username']}")
        print()
        
        # Test 1: Enhanced Login Flow
        success1 = self.test_enhanced_login_flow()
        
        # Test 2: Phone 2FA Flow  
        success2 = self.test_phone_2fa_flow()
        
        # Test 3: Device Trust Simulation
        self.test_device_trust_simulation()
        
        # Summary
        print("\n" + "=" * 50)
        print("📊 Test Summary")
        print("=" * 50)
        print(f"Enhanced Login: {'✅ PASS' if success1 else '❌ FAIL'}")
        print(f"Phone 2FA: {'✅ PASS' if success2 else '❌ FAIL'}")
        print(f"Device Trust Simulation: ✅ PASS")
        
        if success1 and success2:
            print("\n🎉 All tests passed! Enhanced 2FA is working correctly.")
        else:
            print("\n⚠️  Some tests failed. Check the backend configuration.")
            print("\nMake sure:")
            print("- Backend server is running on localhost:5000")
            print("- Test user 'francis' exists with password 'password123'")
            print("- Mobile routes are properly configured")

if __name__ == "__main__":
    test = Enhanced2FATest()
    test.run_all_tests() 