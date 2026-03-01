const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Klucz API z Twojego konta Google
const API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.post('/edit-photo', async (req, res) => {
    try {
        const { imageBase64, prompt } = req.body;
        
        const requestBody = {
            contents: [{
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
                ]
            }]
        };

        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        const data = await response.json();
        
        // Wyciągnij obraz z odpowiedzi
        let editedImageBase64 = null;
        if (data.candidates && data.candidates[0]?.content?.parts) {
            for (const part of data.candidates[0].content.parts) {
                if (part.inline_data?.data) {
                    editedImageBase64 = part.inline_data.data;
                    break;
                }
            }
        }

        if (!editedImageBase64) {
            throw new Error('Nie otrzymano obrazu z API');
        }
        
        res.json({ image: editedImageBase64 });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server działa na porcie ${PORT}`);
});