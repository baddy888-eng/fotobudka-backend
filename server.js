const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const PROJECT_ID = 'fotobudka-ai';
const LOCATION = 'us-central1';
// 👇 ZMIANA 1: Poprawny model do edycji obrazów
const MODEL = 'imagen-3.0-capability-001';

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// 🔐 Autoryzacja (bez zmian - działa dobrze!)
async function getAccessToken() {
    try {
        const credentialsJson = process.env.GOOGLE_CREDENTIALS;
        if (!credentialsJson) throw new Error('Brak GOOGLE_CREDENTIALS');

        const credentials = JSON.parse(credentialsJson);

        const auth = new GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });

        const client = await auth.getClient();
        const token = await client.getAccessToken();

        return token.token;

    } catch (error) {
        console.error('❌ Błąd autoryzacji:', error);
        throw error;
    }
}

// 📸 Edycja zdjęcia
app.post('/edit-photo', async (req, res) => {
    try {
        const { imageBase64, prompt } = req.body;

        if (!imageBase64 || !prompt) {
            return res.status(400).json({ error: 'Brak imageBase64 lub prompt' });
        }

        console.log('📸 Otrzymano zdjęcie');
        const accessToken = await getAccessToken();

        const vertexUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

        // 👇 ZMIANA 2: Poprawna struktura dla Imagen 3.0 capability (edycja)
        const requestBody = {
            instances: [
                {
                    prompt: prompt,
                    referenceImages: [
                        {
                            referenceType: "REFERENCE_TYPE_RAW",
                            referenceId: 1,
                            referenceImage: {
                                bytesBase64Encoded: imageBase64
                            }
                        }
                    ]
                }
            ],
            parameters: {
                sampleCount: 1
                // Opcjonalnie możesz dodać:
                // "language": "pl"
            }
        };

        console.log('🚀 Wysyłam do Imagen (edycja)');

        const response = await fetch(vertexUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ Błąd API:', JSON.stringify(data, null, 2));
            throw new Error(data.error?.message || 'Błąd wywołania Imagen API');
        }

        console.log('📩 Odpowiedź z Vertex otrzymana');

        let editedImageBase64 = null;

        // 👇 ZMIANA 3: Inna struktura odpowiedzi dla Imagen capability
        if (data.predictions && data.predictions.length > 0) {
            // Dla imagen-3.0-capability-001 odpowiedź może być w innym polu
            // Sprawdzamy różne możliwe lokalizacje obrazu
            const pred = data.predictions[0];
            
            if (pred.bytesBase64Encoded) {
                editedImageBase64 = pred.bytesBase64Encoded;
            } else if (pred.image?.bytesBase64Encoded) {
                editedImageBase64 = pred.image.bytesBase64Encoded;
            }
        }

        if (!editedImageBase64) {
            console.error('❌ Nie znaleziono obrazu. Odpowiedź:', JSON.stringify(data, null, 2));
            throw new Error('Nie otrzymano obrazu z Imagen');
        }

        console.log('✅ Odsyłam obraz do frontendu');
        res.json({ image: editedImageBase64 });

    } catch (error) {
        console.error('❌ Błąd serwera:', error);
        res.status(500).json({ error: error.message });
    }
});

// 🟢 Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK' });
});

app.listen(PORT, () => {
    console.log(`✅ Serwer fotobudki działa na porcie ${PORT}`);
    console.log(`📸 Model: ${MODEL} (Imagen 3.0 capability - edycja)`);
});
