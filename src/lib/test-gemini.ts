import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function listModels() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    // We can't easily list models with the standard SDK without more calls, 
    // but we can test a few names.
    console.log("Testing gemini-1.5-flash...");
    const result = await model.generateContent("test");
    console.log("Success with gemini-1.5-flash");
  } catch (err: any) {
    console.error("Error with gemini-1.5-flash:", err.message);
  }
}

listModels();
