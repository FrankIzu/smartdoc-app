import { Link } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService } from '../../services/api';
import { useAuth } from '../context/auth';

type PhoneLoginStep = 'phone' | 'verify' | 'password';

export default function PhoneLoginScreen() {
    const router = useRouter();
    const [step, setStep] = useState<PhoneLoginStep>('phone');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [countryCode, setCountryCode] = useState('+1');
    const [otpCode, setOtpCode] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [maskedPhone, setMaskedPhone] = useState('');
    const [testOtp, setTestOtp] = useState(''); // For development testing

    const { signIn } = useAuth();

    const handlePhoneSubmit = async () => {
        if (!phoneNumber) {
            setError('Please enter your phone number');
            return;
        }

        try {
            setLoading(true);
            setError('');

            // Check if phone is registered
            const checkResponse = await apiService.checkPhone(phoneNumber, countryCode);
            
            if (!checkResponse.registered) {
                setError('Phone number not found. Please check your number or sign up.');
                return;
            }

            // Request OTP
            const otpResponse = await apiService.requestOtp(phoneNumber, countryCode, 'login');
            
            if (otpResponse.success) {
                setMaskedPhone(otpResponse.phoneNumber);
                if (otpResponse.testMode && otpResponse.testOtp) {
                    setTestOtp(otpResponse.testOtp);
                    Alert.alert(
                        'Development Mode', 
                        `Test OTP: ${otpResponse.testOtp}`,
                        [{ text: 'OK' }]
                    );
                }
                setStep('verify');
            } else {
                setError(otpResponse.message || 'Failed to send verification code');
            }
        } catch (error: any) {
            console.error('Phone submit error:', error);
            setError(error.message || 'Failed to process phone number');
        } finally {
            setLoading(false);
        }
    };

    const handleOtpSubmit = async () => {
        if (!otpCode) {
            setError('Please enter the verification code');
            return;
        }

        try {
            setLoading(true);
            setError('');

            const verifyResponse = await apiService.verifyOtp(phoneNumber, otpCode);
            
            if (verifyResponse.success) {
                setStep('password');
            } else {
                setError(verifyResponse.message || 'Invalid verification code');
            }
        } catch (error: any) {
            console.error('OTP verification error:', error);
            setError(error.message || 'Invalid verification code');
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordSubmit = async () => {
        if (!password) {
            setError('Please enter your password');
            return;
        }

        try {
            setLoading(true);
            setError('');

            const loginResponse = await apiService.loginWithPhone(phoneNumber, password);
            
            if (loginResponse.success && loginResponse.user) {
                // Use the auth context to sign in
                const user = {
                    id: loginResponse.user.id.toString(),
                    email: loginResponse.user.email || phoneNumber,
                    name: `${loginResponse.user.first_name || ''} ${loginResponse.user.last_name || ''}`.trim() || 
                          loginResponse.user.username || phoneNumber,
                };
                
                // Set auth state manually since we're bypassing normal signIn
                await signIn(phoneNumber, password);
                router.replace('/(tabs)');
            } else {
                setError(loginResponse.message || 'Login failed');
            }
        } catch (error: any) {
            console.error('Password login error:', error);
            setError(error.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    const handleResendOtp = async () => {
        try {
            setLoading(true);
            setError('');

            const otpResponse = await apiService.requestOtp(phoneNumber, countryCode, 'login');
            
            if (otpResponse.success) {
                if (otpResponse.testMode && otpResponse.testOtp) {
                    setTestOtp(otpResponse.testOtp);
                    Alert.alert(
                        'Development Mode', 
                        `New Test OTP: ${otpResponse.testOtp}`,
                        [{ text: 'OK' }]
                    );
                }
                Alert.alert('Success', 'New verification code sent!');
            } else {
                setError(otpResponse.message || 'Failed to resend code');
            }
        } catch (error: any) {
            setError(error.message || 'Failed to resend code');
        } finally {
            setLoading(false);
        }
    };

    const renderPhoneStep = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Enter Phone Number</Text>
            <Text style={styles.stepDescription}>
                We'll send you a verification code to confirm your identity
            </Text>

            <View style={styles.phoneContainer}>
                <TextInput
                    style={styles.countryInput}
                    value={countryCode}
                    onChangeText={setCountryCode}
                    placeholder="+1"
                />
                <TextInput
                    style={styles.phoneInput}
                    placeholder="Phone number"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="phone-pad"
                    autoFocus
                />
            </View>

            <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handlePhoneSubmit}
                disabled={loading}
            >
                {loading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.buttonText}>Send Code</Text>
                )}
            </Pressable>
        </View>
    );

    const renderVerifyStep = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Enter Verification Code</Text>
            <Text style={styles.stepDescription}>
                We sent a 6-digit code to {maskedPhone}
            </Text>
            
            {testOtp && (
                <View style={styles.testModeContainer}>
                    <Text style={styles.testModeText}>🔧 Dev Mode - OTP: {testOtp}</Text>
                </View>
            )}

            <TextInput
                style={styles.otpInput}
                placeholder="000000"
                value={otpCode}
                onChangeText={setOtpCode}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
            />

            <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleOtpSubmit}
                disabled={loading}
            >
                {loading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.buttonText}>Verify</Text>
                )}
            </Pressable>

            <Pressable
                style={styles.linkButton}
                onPress={handleResendOtp}
                disabled={loading}
            >
                <Text style={styles.linkText}>Resend code</Text>
            </Pressable>

            <Pressable
                style={styles.linkButton}
                onPress={() => setStep('phone')}
            >
                <Text style={styles.linkText}>Change phone number</Text>
            </Pressable>
        </View>
    );

    const renderPasswordStep = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Enter Password</Text>
            <Text style={styles.stepDescription}>
                Phone verified! Now enter your password to complete login
            </Text>

            <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoFocus
            />

            <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handlePasswordSubmit}
                disabled={loading}
            >
                {loading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.buttonText}>Sign In</Text>
                )}
            </Pressable>

            <Pressable
                style={styles.linkButton}
                onPress={() => setStep('verify')}
            >
                <Text style={styles.linkText}>Back to verification</Text>
            </Pressable>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <Text style={styles.title}>GrabDocs</Text>
                        <Text style={styles.subtitle}>2FA Phone Login</Text>
                    </View>

                    {step === 'phone' && renderPhoneStep()}
                    {step === 'verify' && renderVerifyStep()}
                    {step === 'password' && renderPasswordStep()}

                    {error ? (
                        <View style={styles.errorContainer}>
                            <Text style={styles.error}>{error}</Text>
                        </View>
                    ) : null}

                    <View style={styles.footer}>
                        <Link href="/sign-in" asChild>
                            <Pressable style={styles.linkButton}>
                                <Text style={styles.linkText}>
                                    Back to regular login
                                </Text>
                            </Pressable>
                        </Link>

                        <Link href="/sign-up" asChild>
                            <Pressable style={styles.linkButton}>
                                <Text style={styles.linkText}>
                                    Don't have an account? Sign up
                                </Text>
                            </Pressable>
                        </Link>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
        justifyContent: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 48,
    },
    title: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#333',
        textAlign: 'center',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginTop: 8,
    },
    stepContainer: {
        marginBottom: 32,
    },
    stepTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333',
        textAlign: 'center',
        marginBottom: 8,
    },
    stepDescription: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 22,
    },
    phoneContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
    },
    countryInput: {
        backgroundColor: '#f5f5f5',
        padding: 16,
        borderRadius: 8,
        fontSize: 16,
        width: 80,
        textAlign: 'center',
    },
    phoneInput: {
        backgroundColor: '#f5f5f5',
        padding: 16,
        borderRadius: 8,
        fontSize: 16,
        flex: 1,
    },
    input: {
        backgroundColor: '#f5f5f5',
        padding: 16,
        borderRadius: 8,
        fontSize: 16,
        marginBottom: 24,
    },
    otpInput: {
        backgroundColor: '#f5f5f5',
        padding: 16,
        borderRadius: 8,
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        letterSpacing: 8,
        marginBottom: 24,
    },
    button: {
        backgroundColor: '#007AFF',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        marginBottom: 16,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    linkButton: {
        padding: 8,
        alignItems: 'center',
    },
    linkText: {
        color: '#007AFF',
        fontSize: 14,
        fontWeight: '500',
    },
    errorContainer: {
        backgroundColor: '#FFF5F5',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#FEB2B2',
    },
    error: {
        color: '#E53E3E',
        fontSize: 14,
        textAlign: 'center',
    },
    testModeContainer: {
        backgroundColor: '#F0F9FF',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#BAE6FD',
    },
    testModeText: {
        color: '#1E40AF',
        fontSize: 14,
        textAlign: 'center',
        fontWeight: '500',
    },
    footer: {
        marginTop: 32,
        gap: 16,
    },
}); 