import axios from 'axios';
import { authenticator } from 'otplib';

// --- Configuration ---
const INDEX_DETAILS = {
    "NIFTY": { "token": "99926000", "exchange": "NSE", "step": 50 },
    "BANKNIFTY": { "token": "99926009", "exchange": "NSE", "step": 100 },
    "FINNIFTY": { "token": "99926037", "exchange": "NSE", "step": 50 },
    "SENSEX": { "token": "99919000", "exchange": "BSE", "step": 100 },
    "MIDCPNIFTY": { "token": "99926074", "exchange": "NSE", "step": 25 },
};

const MONTHLY_EXPIRY_SYMBOLS = ["BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"];
const MARKET_HOLIDAYS_2025 = [
    '2025-02-26', '2025-03-14', '2025-03-31', '2025-04-10', '2025-04-14',
    '2025-04-18', '2025-05-01', '2025-08-15', '2025-08-27', '2025-10-02',
    '2025-10-21', '2025-10-22', '2025-11-05', '2025-12-25',
].map(d => new Date(d + 'T00:00:00.000Z'));

const isHoliday = (date) => {
    const dateString = date.toISOString().split('T')[0];
    return MARKET_HOLIDAYS_2025.some(holiday => holiday.toISOString().split('T')[0] === dateString);
};

class SmartApiService {
    constructor() {
        this.apiKey = process.env.API_KEY;
        this.clientId = process.env.CLIENT_ID;
        this.pin = process.env.PIN;
        this.totpSecret = process.env.TOTP_SECRET;
        this.session = null;
        this.apiClient = axios.create({
            baseURL: 'https://apiconnect.angelbroking.com',
            headers: {
                'Content-Type': 'application/json', 'Accept': 'application/json',
                'X-UserType': 'USER', 'X-SourceID': 'WEB',
                'X-ClientLocalIP': '127.0.0.1', 'X-ClientPublicIP': '103.103.103.103',
                'X-MACAddress': '00:00:00:00:00:00', 'X-PrivateKey': this.apiKey,
            },
        });
    }

    async login() {
        if (!this.totpSecret) throw new Error("TOTP_SECRET is not defined in your .env file.");
        const dynamicTotp = authenticator.generate(this.totpSecret);
        console.log(`Attempting to log in with generated TOTP: ${dynamicTotp}`);
        try {
            const response = await this.apiClient.post('/rest/auth/angelbroking/user/v1/loginByPassword', {
                clientcode: this.clientId, password: this.pin, totp: dynamicTotp,
            });
            if (response.data.status && response.data.data.jwtToken) {
                this.session = response.data.data;
                this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${this.session.jwtToken}`;
                console.log("✅ SmartAPI Login Successful!");
                return true;
            }
            console.error("SmartAPI Login Failed:", response.data.message || response.data.errorcode);
            return false;
        } catch (error) {
            console.error("Error during SmartAPI login:", error.response ? error.response.data : error.message);
            throw new Error("Could not log in to SmartAPI.");
        }
    }

    async getLtp(symbol) {
        const details = INDEX_DETAILS[symbol];
        if (!details) {
            console.error(`No details found for symbol: ${symbol}`);
            return null;
        }
        console.log(`Fetching LTP for ${symbol} (token: ${details.token})`);
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(toDate.getDate() - 5);
        const formatDate = (d) => d.toISOString().slice(0, 16).replace('T', ' ');

        try {
            const response = await this.apiClient.post('/rest/secure/angelbroking/historical/v1/getCandleData', {
                exchange: details.exchange, symboltoken: details.token,
                interval: "ONE_DAY", fromdate: formatDate(fromDate), todate: formatDate(toDate)
            });
            if (response.data.status && response.data.data && response.data.data.length > 0) {
                const lastCandle = response.data.data[response.data.data.length - 1];
                return lastCandle[4]; // Index 4 is the close price
            }
            console.warn(`Could not fetch LTP for ${symbol}:`, response.data.message || "No data returned");
            return null;
        } catch (error) {
            const errorMsg = error.response ? (error.response.data.message || JSON.stringify(error.response.data)) : error.message;
            console.error(`Error in LTP workaround for ${symbol}:`, errorMsg);
            return null;
        }
    }

    getLastThursdayOfMonth(year, month) {
        const lastDay = new Date(Date.UTC(year, month + 1, 0));
        let day = new Date(lastDay.getTime());
        while (day.getUTCDay() !== 4) day.setUTCDate(day.getUTCDate() - 1);
        while (isHoliday(day)) day.setUTCDate(day.getUTCDate() - 1);
        return day;
    }

    getNearestExpiryDate(symbol) {
        const now_ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const today = new Date(Date.UTC(now_ist.getFullYear(), now_ist.getMonth(), now_ist.getDate()));
        let expiryDate;
        if (MONTHLY_EXPIRY_SYMBOLS.includes(symbol)) {
            const currentMonthExpiry = this.getLastThursdayOfMonth(today.getUTCFullYear(), today.getUTCMonth());
            expiryDate = today > currentMonthExpiry ? this.getLastThursdayOfMonth(today.getUTCFullYear(), today.getUTCMonth() + 1) : currentMonthExpiry;
        } else {
            const weekdayMap = { "NIFTY": 4, "SENSEX": 5 };
            const targetWeekday = weekdayMap[symbol] || 4;
            let daysAhead = (targetWeekday - today.getUTCDay() + 7) % 7;
            if (daysAhead === 0 && now_ist.getHours() >= 16) daysAhead = 7;
            expiryDate = new Date(today);
            expiryDate.setUTCDate(today.getUTCDate() + daysAhead);
            while (isHoliday(expiryDate) || expiryDate.getUTCDay() % 6 === 0) {
                expiryDate.setUTCDate(expiryDate.getUTCDate() - 1);
            }
        }
        const day = String(expiryDate.getUTCDate()).padStart(2, '0');
        const month = expiryDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
        const year = expiryDate.getUTCFullYear();
        return `${day}${month}${year}`;
    }

    async getOptionGreeks(symbol, expiryDate) {
        console.log(`Fetching all greeks for ${symbol} with expiry ${expiryDate}...`);
        try {
            const response = await this.apiClient.post('/rest/secure/angelbroking/marketData/v1/optionGreek', {
                name: symbol, expirydate: expiryDate,
            });
            if (response.data && response.data.status) {
                console.log(`✅ Successfully fetched greeks data for ${symbol}.`);
                return response.data.data || [];
            }
            console.warn(`Could not fetch greeks for ${symbol}:`, response.data.message || "Unknown error");
            return [];
        } catch (error) {
            const errorMsg = error.response ? (error.response.data.message || JSON.stringify(error.response.data)) : error.message;
            console.error(`Error fetching option greeks for ${symbol}:`, errorMsg);
            return [];
        }
    }
}

export default SmartApiService;
