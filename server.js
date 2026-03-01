const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// STAŁE KONFIGURACYJNE – UZUPEŁNIJ SWOIMI DANYMI!
const PROJECT_ID = 'fotobudka-ai';  // Twoja nazwa projektu
const LOCATION = 'us-central1';      // Region
const MODEL = 'gemini-2.5-flash-image';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Funkcja do uzyskiwania tokena dostępu
async function getAccessToken() {
    try {
        const credentialsJson = process.env.GOOGLE_CREDENTIALS;
        
        if (!credentialsJson) {
            throw new Error('Brak GOOGLE_CREDENTIALS w zmiennych środowiskowych');
        }
        
        console.log("✅ Znaleziono zmienną GOOGLE_CREDENTIALS");
        
        let credentials;
        try {
            credentials = JSON.parse(credentialsJson);
            console.log("✅ JSON sparsowany poprawnie");
            console.log("📧 client_email:", credentials.client_email);
        } catch (parseError) {
            console.error("❌ Błąd parsowania JSON:", parseError.message);
            throw new Error('Nieprawidłowy format JSON w GOOGLE_CREDENTIALS');
        }
        
        const auth = new GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
        
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        console.log("✅ Token uzyskany pomyślnie");
        return token.token;
        
    } catch (error) {
        console.error('❌ Błąd autoryzacji:', error);
        throw error;
    }
}

app.post('/edit-photo', async (req, res) => {
    try {
        const { imageBase64, prompt } = req.body;
        
        console.log('📸 Otrzymano zdjęcie. Uzyskuję token...');
        
        const accessToken = await getAccessToken();
        
        const vertexUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
        
        console.log('🚀 Wysyłam zapytanie do Vertex AI...');
        
        const requestBody = {
            contents: [{
                role: "user",
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
            generation_config: {
                response_modalities: ["image", "text"]
            }
        };

        const response = await fetch(vertexUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        console.log('📩 Otrzymano odpowiedź z Vertex AI');
        
        // 🔍🔍🔍 SZCZEGÓŁOWE LOGOWANIE ODPOWIEDZI 🔍🔍🔍
        console.log('📋 Pełna odpowiedź:', JSON.stringify(data, null, 2));

        let editedImageBase64 = null;

        // Sprawdź czy w ogóle są candidates
        if (!data.candidates) {
            console.log('❌ Brak candidates w odpowiedzi');
            if (data.error) {
                throw new Error(`Błąd Vertex AI: ${data.error.message || JSON.stringify(data.error)}`);
            }
        }

        if (data.candidates && data.candidates[0]?.content?.parts) {
            console.log('📦 Znaleziono parts:', data.candidates[0].content.parts.length);
            
            for (const part of data.candidates[0].content.parts) {
                console.log('🔍 Part keys:', Object.keys(part));
                
                if (part.inline_data?.data) {
                    editedImageBase64 = part.inline_data.data;
                    console.log('✅ Znaleziono obraz w odpowiedzi!');
                    break;
                }
                
                if (part.text) {
                    console.log('📝 Model zwrócił tekst:', part.text.substring(0, 200));
                }
            }
        }

        if (!editedImageBase64) {
            console.error('❌ Brak obrazu w odpowiedzi');
            
            // Sprawdź blokadę bezpieczeństwa
            if (data.candidates && data.candidates[0]?.safety_ratings) {
                console.log('🛡️ Safety ratings:', JSON.stringify(data.candidates[0].safety_ratings, null, 2));
            }
            
            if (data.prompt_feedback) {
                console.log('⚠️ Prompt feedback:', JSON.stringify(data.prompt_feedback, null, 2));
            }
            
            throw new Error('Nie otrzymano obrazu z API');
        }
        
        console.log('✅ Odsyłam obraz do frontendu');
        res.json({ image: editedImageBase64 });

    } catch (error) {
        console.error('❌ Błąd serwera:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Serwer fotobudki na Vertex AI działa!' });
});

app.listen(PORT, () => {
    console.log(`✅ Serwer fotobudki na Vertex AI działa na porcie ${PORT}`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`📸 Model: ${MODEL}`);
    console.log(`📁 Projekt: ${PROJECT_ID}`);
    console.log(`🌍 Lokalizacja: ${LOCATION}`);
    console.log(`🔑 Autoryzacja: przez zmienną środowiskową GOOGLE_CREDENTIALS`);
});
