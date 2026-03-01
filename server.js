const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const cors = require('cors');
const fetch = require('node-fetch'); // Upewnij się, że masz zainstalowane node-fetch, jeśli używasz starszego Node.js

const app = express();
const PORT = process.env.PORT || 3000;

const PROJECT_ID = 'fotobudka-ai';
const LOCATION = 'us-central1';
// ✅ Model wspierający edycję (inpainting/outpainting)
const MODEL = 'imagen-3';

app.use(cors());
// Zwiększony limit, aby obsłużyć duże zdjęcia w Base64
app.use(express.json({ limit: '50mb' }));

/**
 * 🔐 Pobieranie tokenu dostępu do Google Cloud
 */
async function getAccessToken() {
    try {
        const credentialsJson = process.env.GOOGLE_CREDENTIALS;
        if (!credentialsJson) throw new Error('Brak zmiennej środowiskowej GOOGLE_CREDENTIALS');

        const credentials = JSON.parse(credentialsJson);

        const auth = new GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });

        const client = await auth.getClient();
        const token = await client.getAccessToken();

        return token.token;
    } catch (error) {
        console.error('❌ Błąd autoryzacji:', error.message);
        throw error;
    }
}

/**
 * 📸 Endpoint do edycji zdjęcia (Inpainting Semantyczny)
 */
app.post('/edit-photo', async (req, res) => {
    try {
        const { imageBase64, prompt } = req.body;

        if (!imageBase64 || !prompt) {
            return res.status(400).json({ error: 'Brak imageBase64 lub promptu w żądaniu' });
        }

        console.log('📸 Rozpoczynam przetwarzanie zdjęcia...');

        // 1. CZYSZCZENIE BASE64 (Usuwamy nagłówek data:image/jpeg;base64, jeśli istnieje)
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

        const accessToken = await getAccessToken();
        const vertexUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

        // 2. STRUKTURA ŻĄDANIA DLA IMAGEN 3.0 CAPABILITY
        const requestBody = {
            instances: [
                {
                    prompt: prompt,
                    image: {
                        bytesBase64Encoded: cleanBase64,
                        mimeType: "image/jpeg"
                    }
                }
            ],
            parameters: {
                sampleCount: 1,
                editMode: "inpainting",
                maskMode: "SEMANTIC", // Model sam znajdzie obiekt z promptu
                outputMimeType: "image/jpeg"
            }
        };

        console.log(`🚀 Wysyłam żądanie do Vertex AI (${MODEL})...`);

        const response = await fetch(vertexUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        // 3. OBSŁUGA BŁĘDÓW API
        if (!response.ok) {
            console.error('❌ Błąd z API Vertex AI:', JSON.stringify(data, null, 2));
            return res.status(response.status).json({
                error: 'Błąd API Google Cloud',
                details: data.error?.message || data
            });
        }

        // 4. WYCIĄGANIE WYGENEROWANEGO OBRAZU
        const prediction = data.predictions && data.predictions[0];
        const editedImageBase64 = prediction?.bytesBase64Encoded;

        if (!editedImageBase64) {
            console.error('❌ Brak obrazu w odpowiedzi. Odpowiedź:', JSON.stringify(data, null, 2));
            throw new Error('Model nie zwrócił żadnego obrazu. Sprawdź czy prompt jest zgodny z polityką treści.');
        }

        console.log('✅ Sukces! Obraz wygenerowany pomyślnie.');
        
        // Zwracamy czysty base64 (Frontend może sobie dodać nagłówek data:image/jpeg;base64,)
        res.json({ 
            image: editedImageBase64,
            mimeType: "image/jpeg" 
        });

    } catch (error) {
        console.error('❌ Błąd krytyczny serwera:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 🟢 Health check
 */
app.get('/health', (req, res) => {
    res.json({ status: 'OK', model: MODEL });
});

app.listen(PORT, () => {
    console.log(`---`);
    console.log(`✅ Serwer Fotobudki AI uruchomiony`);
    console.log(`🚀 Port: ${PORT}`);
    console.log(`📸 Model: ${MODEL}`);
    console.log(`---`);
});

