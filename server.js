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

// Funkcja do uzyskiwania tokena dostępu – TERAZ UŻYWA ZMIENNEJ ŚRODOWISKOWEJ!
async function getAccessToken() {
    try {
        // Pobierz dane uwierzytelniające ze zmiennej środowiskowej
        const credentialsJson = process.env.GOOGLE_CREDENTIALS;
        
        if (!credentialsJson) {
            throw new Error('Brak GOOGLE_CREDENTIALS w zmiennych środowiskowych');
        }
        
        console.log("✅ Znaleziono zmienną GOOGLE_CREDENTIALS");
        
        // Parsuj JSON
        let credentials;
        try {
            credentials = JSON.parse(credentialsJson);
            console.log("✅ JSON sparsowany poprawnie");
            console.log("📧 client_email:", credentials.client_email);
        } catch (parseError) {
            console.error("❌ Błąd parsowania JSON:", parseError.message);
            throw new Error('Nieprawidłowy format JSON w GOOGLE_CREDENTIALS');
        }
        
        // Autoryzacja przez credentials (NIE przez plik!)
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
        
        // 1. Uzyskaj token dostępu
        const accessToken = await getAccessToken();
        
        // 2. Przygotuj URL dla Vertex AI
        const vertexUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
        
        console.log('🚀 Wysyłam zapytanie do Vertex AI...');
        
        // ⚡⚡⚡ POPRAWKA: DODANO POLE "role": "user" ⚡⚡⚡
        const requestBody = {
            contents: [{
                role: "user",  // ← TO JEST JEDYNA ZMIANA W TWOIM KODZIE!
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

        // 4. Wyślij zapytanie z tokenem
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

        // 5. Wyciągnij obraz z odpowiedzi
        let editedImageBase64 = null;
        
        if (data.candidates && data.candidates[0]?.content?.parts) {
            for (const part of data.candidates[0].content.parts) {
                if (part.inline_data?.data) {
                    editedImageBase64 = part.inline_data.data;
                    console.log('✅ Znaleziono obraz w odpowiedzi!');
                    break;
                }
            }
        }

        if (!editedImageBase64) {
            console.error('❌ Brak obrazu. Odpowiedź:', JSON.stringify(data, null, 2));
            
            // Sprawdź czy to błąd autoryzacji
            if (data.error) {
                throw new Error(`Błąd Vertex AI: ${data.error.message || JSON.stringify(data.error)}`);
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
