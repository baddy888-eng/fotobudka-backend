const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const PROJECT_ID = 'fotobudka-ai';
const LOCATION = 'us-central1';
const MODEL = 'imagen-3.0-capability-001';

app.use(cors());
app.use(express.json({ limit: '20mb' }));

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

app.post('/edit-photo', async (req, res) => {
    try {
        const { imageBase64, prompt } = req.body;

        if (!imageBase64 || !prompt) {
            return res.status(400).json({ error: 'Brak imageBase64 lub prompt' });
        }

        console.log('📸 Otrzymano zdjęcie z promptem:', prompt);
        const accessToken = await getAccessToken();

        const vertexUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

        // ✅ Poprawna struktura dla Imagen 3.0 capability (edycja)
        const requestBody = {
            instances: [
                {
                    // Ważne: prompt musi być na tym poziomie, a nie wewnątrz referenceImages
                    prompt: prompt,
                    referenceImages: [
                        {
                            referenceType: "REFERENCE_TYPE_RAW",
                            referenceId: 1,
                            referenceImage: {
                                bytesBase64Encoded: imageBase64,
                                mimeType: "image/jpeg"
                            }
                        }
                    ]
                }
            ],
            parameters: {
                sampleCount: 1,
                // Dodajemy parametry edycji
                editConfig: {
                    editMode: "INPAINTING", // Tryb edycji – zamalowywanie
                    maskMode: "SEMANTIC"     // Automatyczne maskowanie na podstawie promptu
                }
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

        // Loguj całą odpowiedź, żeby zobaczyć strukturę
        console.log('🔍 Struktura odpowiedzi:', JSON.stringify(data, null, 2).substring(0, 500));

        if (data.predictions && data.predictions.length > 0) {
            const pred = data.predictions[0];
            
            // Sprawdzamy różne możliwe formaty odpowiedzi
            if (pred.bytesBase64Encoded) {
                editedImageBase64 = pred.bytesBase64Encoded;
                console.log('✅ Znaleziono obraz w bytesBase64Encoded');
            } else if (pred.image?.bytesBase64Encoded) {
                editedImageBase64 = pred.image.bytesBase64Encoded;
                console.log('✅ Znaleziono obraz w image.bytesBase64Encoded');
            } else if (Array.isArray(pred.images) && pred.images[0]?.bytesBase64Encoded) {
                editedImageBase64 = pred.images[0].bytesBase64Encoded;
                console.log('✅ Znaleziono obraz w images[0].bytesBase64Encoded');
            }
        }

        if (!editedImageBase64) {
            console.error('❌ Nie znaleziono obrazu. Pełna odpowiedź:', JSON.stringify(data, null, 2));
            throw new Error('Nie otrzymano obrazu z Imagen');
        }

        console.log('✅ Odsyłam obraz do frontendu (długość:', editedImageBase64.length, ')');
        res.json({ image: editedImageBase64 });

    } catch (error) {
        console.error('❌ Błąd serwera:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK' });
});

app.listen(PORT, () => {
    console.log(`✅ Serwer fotobudki działa na porcie ${PORT}`);
    console.log(`📸 Model: ${MODEL} (Imagen 3.0 capability - edycja)`);
});
