import config from '../config/index.js';
export class SmsService {
    static instance;
    constructor() { }
    static getInstance() {
        if (!SmsService.instance) {
            SmsService.instance = new SmsService();
        }
        return SmsService.instance;
    }
    async sendOTP(phoneNumber, otp) {
        console.log(`[SMS_SERVICE] Attempting to send OTP ${otp} to ${phoneNumber}`);
        // If Twilio is configured, use it
        if (config.twilio.accountSid && config.twilio.authToken && config.twilio.phoneNumber) {
            try {
                // We'll dynamic import to avoid issues if not installed yet or in different environments
                const twilio = (await import('twilio')).default;
                const client = twilio(config.twilio.accountSid, config.twilio.authToken);
                await client.messages.create({
                    body: `Your Offramp verification code is: ${otp}. Valid for 10 minutes.`,
                    from: config.twilio.phoneNumber,
                    to: phoneNumber
                });
                return true;
            }
            catch (error) {
                console.error('[SMS_SERVICE] Twilio failed:', error);
                // Fallback to log in development, but in production this should probably fail
                if (config.nodeEnv === 'production')
                    return false;
            }
        }
        // Default behavior for development: Log to console
        console.log(`
      **************************************************
      [DEVELOPMENT ONLY]
      TO: ${phoneNumber}
      MESSAGE: Your Offramp verification code is: ${otp}
      **************************************************
    `);
        return true;
    }
}
export default SmsService.getInstance();
//# sourceMappingURL=smsService.js.map