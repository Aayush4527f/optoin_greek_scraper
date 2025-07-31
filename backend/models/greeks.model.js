// importing mongoose
import mongoose from "mongoose";

const greeksSchema = mongoose.Schema({
    Symbol:{
        type: String,
        required: true
    },
    Data:{
        type: JSON,
        required: true
    },

});

// mongoose model
const Greeks = mongoose.model("Greeks",greeksSchema);

// exporting model
export default Greeks;