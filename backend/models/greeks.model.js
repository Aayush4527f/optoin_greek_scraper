import mongoose from "mongoose";

// This is the schema that will be used for all greek collections.
const greekDataSchema = new mongoose.Schema({
    iv: { type: Number },
    delta: { type: Number },
    gamma: { type: Number },
    theta: { type: Number },
    vega: { type: Number },
    ltp: { type: Number },
    strikePrice: { type: Number },
    optionType: { type: String, enum: ['CE', 'PE'] },
}, { _id: false });

const greeksSchema = new mongoose.Schema({
    symbol: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    token: {
        type: String,
        required: true,
    },
    data: greekDataSchema,
}, {
    timestamps: true // Adds createdAt and updatedAt timestamps
});

// This object will act as a cache to store the models once they are created.
const models = {};

/**
 * A factory function to create or retrieve a Mongoose model for a specific index.
 * This allows us to use a different collection for each stock index.
 * @param {string} symbol - The stock index symbol (e.g., 'NIFTY', 'BANKNIFTY').
 * @returns {mongoose.Model} The Mongoose model for the specified collection.
 */
export const getGreekModel = (symbol) => {
    const modelName = symbol.toLowerCase();
    if (!models[modelName]) {
        // If the model doesn't already exist, create it.
        // The collection name is dynamically created, e.g., 'nifty_greeks'.
        const collectionName = `${modelName}_greeks`; 
        models[modelName] = mongoose.model(modelName, greeksSchema, collectionName);
        console.log(`Mongoose model created for collection: ${collectionName}`);
    }
    return models[modelName];
};
