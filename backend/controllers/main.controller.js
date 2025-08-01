import path from 'path';
import { fileURLToPath } from 'url';
import SmartApiService from '../services/smartapi.service.js';
// Import the model factory function instead of the static model
import { getGreekModel } from '../models/greeks.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Updated the list to remove SENSEX
const INDICES_TO_SCRAPE = {
    "NIFTY": { step: 50 },
    "BANKNIFTY": { step: 100 },
    "FINNIFTY": { step: 50 },
    "MIDCPNIFTY": { step: 25 },
};
const STRIKE_RANGE = 5; // Number of strikes above and below ATM

// Updated the delay to 2 seconds (2000 milliseconds)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const serveFile = (file_address) => (req, res) => {
    return res.sendFile(path.join(__dirname, '../../static', file_address));
};

export const fetchAndLogGreeks = async (req, res) => {
    console.log("Received request to fetch and log greeks...");
    res.status(202).json({ message: "Accepted. Fetching process initiated in the background." });

    const smartApiService = new SmartApiService();

    try {
        const isLoggedIn = await smartApiService.login();
        if (!isLoggedIn) throw new Error("Login failed, aborting fetch process.");

        for (const [indexName, details] of Object.entries(INDICES_TO_SCRAPE)) {
            console.log(`\n--- Processing Index: ${indexName} ---`);

            const ltp = await smartApiService.getLtp(indexName);
            
            // Increased delay to 2 seconds
            await delay(2000); 

            if (ltp === null) {
                console.warn(`Could not get LTP for ${indexName}. Skipping.`);
                continue;
            }
            const atmStrike = Math.round(ltp / details.step) * details.step;
            const lowerBound = atmStrike - (STRIKE_RANGE * details.step);
            const upperBound = atmStrike + (STRIKE_RANGE * details.step);
            console.log(`LTP: ${ltp}, ATM Strike: ${atmStrike}. Filtering for strikes between ${lowerBound} and ${upperBound}.`);

            const expiryDate = smartApiService.getNearestExpiryDate(indexName);
            const allGreeksData = await smartApiService.getOptionGreeks(indexName, expiryDate);

            if (allGreeksData && allGreeksData.length > 0) {
                const filteredGreeks = allGreeksData.filter(greek => {
                    const strikePrice = parseFloat(greek.strikePrice);
                    return strikePrice >= lowerBound && strikePrice <= upperBound;
                });

                if (filteredGreeks.length === 0) {
                    console.log(`No options found within the strike range for ${indexName}.`);
                    await delay(2000);
                    continue;
                }

                // Get the correct Mongoose Model for the current index
                const GreekModel = getGreekModel(indexName);

                const operations = filteredGreeks.map(greek => {
                    const strike = parseFloat(greek.strikePrice).toFixed(0);
                    const symbol = `${indexName}${expiryDate}${strike}${greek.optionType}`;
                    const greekPayload = {
                        iv: greek.impliedVolatility, delta: greek.delta, gamma: greek.gamma,
                        theta: greek.theta, vega: greek.vega, ltp: greek.ltp,
                        strikePrice: greek.strikePrice, optionType: greek.optionType,
                    };
                    return GreekModel.findOneAndUpdate(
                        { symbol: symbol },
                        { symbol: symbol, token: 'N/A', data: greekPayload },
                        { upsert: true, new: true, setDefaultsOnInsert: true }
                    );
                });

                await Promise.all(operations);
                console.log(`✅ Saved/Updated ${operations.length} instruments to '${GreekModel.collection.name}' collection.`);
            } else {
                console.log(`No greeks data returned for ${indexName} on ${expiryDate}.`);
            }

            console.log("Waiting 2 seconds before next request...");
            await delay(2000); // Respect API rate limit
        }
    } catch (error) {
        console.error("A critical error occurred during the fetch process:", error.message);
    } finally {
        console.log("\nFetch process finished.");
    }
};
