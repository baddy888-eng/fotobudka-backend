const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Konfiguracja Google Cloud
const PROJECT_ID = 'fotobudka-ai';
const LOCATION = 'us-central1';
const MODEL = 'imagen-3.0-capability-001';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Zwiększony limit dla dużych zdjęć Base64

// 1. Funkcja do autoryzacji Google Cloud
async function getAccessToken() {
    try {
        const credentialsJson = process.env.GOOGLE_CREDENTIALS;
        if (!credentialsJson) {
            throw new Error('Brak zmiennej środowiskowej GOOGLE_CREDENTIALS. Upewnij się, że plik .env ją zawiera.');
        }

        const auth = new GoogleAuth({
            credentials: JSON.parse(credentialsJson),
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });

        const client = await auth.getClient();
        const token = await client.getAccessToken();
        return token.token;
    } catch (error) {
        console.error('❌ Błąd podczas generowania tokenu autoryzacji:', error.message);
        throw error;
    }
}

// 2. Endpoint do edycji zdjęć
app.post('/edit-photo', async (req, res) => {
    try {
        const { imageBase64, prompt } = req.body;

        // Walidacja danych wejściowych
        if (!imageBase64 || !prompt) {
            return res.status(400).json({ error: 'Brakujące dane: upewnij się, że wysyłasz "imageBase64" oraz "prompt".' });
        }

        console.log(`\n📸 Otrzymano żądanie edycji.`);
        console.log(`📝 Prompt: "${prompt}"`);

        // Czyszczenie Base64 (usuwanie nagłówka np. 'data:image/jpeg;base64,')
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

        // Pobranie tokenu
        const accessToken = await getAccessToken();
        const endpointUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

        // Struktura żądania dla Vertex AI (Imagen 3)
        const requestBody = {
            instances: [
                {
                    prompt: prompt,
                    image: {
                        bytesBase64Encoded: cleanBase64
                    }
                }
            ],
            parameters: {
                sampleCount: 1,
                editMode: "inpainting", 
                maskMode: "SEMANTIC", // Imagen sam spróbuje dopasować obszar edycji do promptu
                outputOptions: {
                    mimeType: "image/jpeg",
                    compressionQuality: 90
                }
            }
        };

        console.log(`🚀 Wysyłanie zapytania do Vertex AI (${MODEL})...`);

        // Wysłanie zapytania do Google API
        const response = await fetch(endpointUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        // 3. Szczegółowa obsługa błędów API
        if (!response.ok) {
            console.error('\n🔴 BŁĄD API GOOGLE CLOUD:');
            console.error(JSON.stringify(data, null, 2));
            console.error('---------------------------\n');
            
            return res.status(response.status).json({
                error: 'Błąd po stronie Google API',
                details: data.error?.message || data
            });
        }

        // 4. Wyciąganie wygenerowanego obrazka
        const editedImageBase64 = data.predictions?.[0]?.bytesBase64Encoded;

        if (!editedImageBase64) {
            console.error('\n🟡 Google nie zwróciło obrazka. Pełna odpowiedź:', JSON.stringify(data, null, 2));
            return res.status(500).json({ error: 'API zwróciło odpowiedź, ale bez obrazka. Może to być blokada filtrów bezpieczeństwa.' });
        }

        console.log(`✅ Edycja zakończona sukcesem. Zwracam obrazek do frontendu.`);
        
        // Zwracamy jako czysty base64 (z dodanym MIME typem dla wygody)
        res.json({
            success: true,
            mimeType: "image/jpeg",
            image: editedImageBase64
        });

    } catch (error) {
        console.error('\n❌ Wystąpił krytyczny błąd serwera:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 5. Prosty Healthcheck
app.get('/health', (req, res) => {
    res.json({ status: 'OK', model: MODEL, location: LOCATION });
});

// Start serwera
app.listen(PORT, () => {
    console.log(`\n======================================`);
    console.log(`🟢 Serwer Fotobudki AI działa!`);
    console.log(`🚀 Port: ${PORT}`);
    console.log(`🤖 Model: ${MODEL}`);
    console.log(`🌍 Region: ${LOCATION}`);
    console.log(`======================================\n`);
});
