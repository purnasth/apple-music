// Scores each audio file given as an argument with Essentia's mood heads, one JSON line
// per file on stdout. Run by build-songs.mjs, several at once: the mel bands are single-threaded.
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HEADS, modelFile } from './hear-models.mjs';

const require = createRequire(import.meta.url);
const tf = require('@tensorflow/tfjs-node');
const { EssentiaWASM, EssentiaModel } = require('essentia.js');
const run = promisify(execFile);

const RATE = 16000;
const PATCH = 187;
const extractor = new EssentiaModel.EssentiaTFInputExtractor(EssentiaWASM, 'musicnn');
const embedder = await tf.loadGraphModel(`file://${await modelFile()}`);
const heads = {};
for (const name of Object.keys(HEADS)) heads[name] = await tf.loadGraphModel(`file://${await modelFile(name)}`);

// The heads read the embedder's dense layer before its ReLU, which the tfjs converter
// fused away; it is redone here from that layer's own weights.
const kernel = embedder.weights['dense/kernel'][0];
const bias = embedder.weights['dense/bias'][0];
const notTraining = tf.tensor([0], [1], 'bool');

/** 200-d MusiCNN embeddings, one per 3 s patch of mel frames. */
const embed = (mel) =>
  tf.tidy(() => {
    const patches = Math.floor(mel.length / PATCH);
    const flat = new Float32Array(patches * PATCH * 96);
    for (let i = 0; i < patches * PATCH; i++) flat.set(mel[i], i * 96);
    const x = tf.tensor(flat, [patches, PATCH, 96]);
    const pre = embedder.execute(
      { 'model/Placeholder': x, 'model/Placeholder_1': notTraining },
      'model/batch_normalization_9/batchnorm/add_1',
    );
    return tf.add(tf.matMul(pre, kernel), bias);
  });

const wav = join(tmpdir(), `hear-${process.pid}.wav`);

for (const file of process.argv.slice(2)) {
  try {
    await run('afconvert', ['-f', 'WAVE', '-d', `LEF32@${RATE}`, '-c', '1', file, wav]);
    const b = await readFile(wav);
    const at = b.indexOf('data') + 8;
    const pcm = new Float32Array(b.buffer.slice(b.byteOffset + at, b.byteOffset + at + ((b.length - at) & ~3)));
    // Three 20 s clips stand in for the whole song, which is several times slower to hear.
    const mel = [0.25, 0.5, 0.75].flatMap((f) => {
      const from = Math.max(0, Math.floor(pcm.length * f) - 10 * RATE);
      return extractor.computeFrameWise(pcm.subarray(from, from + 20 * RATE), 256).melSpectrum;
    });
    if (mel.length < PATCH) throw new Error('too short');
    const emb = embed(mel);
    const scores = {};
    for (const [name, yes] of Object.entries(HEADS)) {
      const p = tf.tidy(() => heads[name].execute(emb).slice([0, yes], [-1, 1]).mean());
      scores[name] = +(await p.data())[0].toFixed(3);
      p.dispose();
    }
    emb.dispose();
    console.log(JSON.stringify({ file, scores }));
  } catch (e) {
    console.error(`  could not hear ${file}: ${String(e.message ?? e).split('\n')[0]}`);
  }
}
await rm(wav, { force: true });
