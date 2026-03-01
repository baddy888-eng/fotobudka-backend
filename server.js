const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Klucz API z Twojego konta Google (przechowywany w zmiennych środowiskowych)
const API_KEY = process.env.GEMINI_API_KEY;

// !!! WAŻNE: Używamy modelu do generowania obrazów !!!
// Model "gemini-2.5-flash-image-preview" (Nano Banana) obsługuje edycję zdjęć
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${API_KEY}`;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Obsługa dużych zdjęć w base64

app.post('/edit-photo', async (req, res) => {
    try {
        // Odbierz zdjęcie i prompt od frontendu
        const { imageBase64, prompt } = req.body;
        
        console.log("Otrzymano zdjęcie i prompt. Wysyłam do Gemini...");
        
        // Przygotuj zapytanie do API Gemini
        const requestBody = {
            contents: [{
                parts: [
                    { text: prompt },
                    { 
                        inline_data: { 
                            mime_type: "image/jpeg", 
                            data: imageBase64 
                        } 
                    }
                ]
            }],
            // ⚡ KLUCZOWE: generation_config wymusza zwrócenie obrazu
            generation_config: {
                response_modalities: ["image", "text"]
            }
        };

        // Wyślij zapytanie do Gemini
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        const data = await response.json();
        console.log("Otrzymano odpowiedź z Gemini");

        // Wyciągnij obraz z odpowiedzi
        let editedImageBase64 = null;
        
        // Sprawdź czy odpowiedź zawiera obraz
        if (data.candidates && 
            data.candidates[0] && 
            data.candidates[0].content && 
            data.candidates[0].content.parts) {
            
            // Przeszukaj wszystkie części odpowiedzi
            for (const part of data.candidates[0].content.parts) {
                // Szukamy części z inline_data (obrazem)
                if (part.inline_data && part.inline_data.data) {
                    editedImageBase64 = part.inline_data.data;
                    console.log("✅ Znaleziono obraz w odpowiedzi!");
                    break;
                }
            }
        }

        // Jeśli nie znaleziono obrazu, sprawdź czy nie ma błędu
        if (!editedImageBase64) {
            // Sprawdź czy API zwróciło błąd
            if (data.error) {
                console.error("Błąd API:", data.error);
                throw new Error(`API Error: ${data.error.message || JSON.stringify(data.error)}`);
            }
            
            console.error("Brak obrazu w odpowiedzi. Otrzymane dane:", JSON.stringify(data, null, 2));
            throw new Error('Nie otrzymano obrazu z API');
        }
        
        // Odeślij edytowane zdjęcie do frontendu
        res.json({ image: editedImageBase64 });

    } catch (error) {
        console.error('Błąd serwera:', error);
        res.status(500).json({ error: error.message });
    }
});

// Prosty endpoint do testowania czy serwer działa
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Serwer fotobudki działa!' });
});

app.listen(PORT, () => {
    console.log(`✅ Serwer fotobudki AI działa na porcie ${PORT}`);
    console.log(`🔗 URL do backendu: http://localhost:${PORT}`);
    console.log(`📸 Model: gemini-2.5-flash-image-preview`);
});
