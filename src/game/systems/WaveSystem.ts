export type WaveTransition = "none" | "advanced" | "victory";

export class WaveSystem {
  private waveIndex = 0;
  private spawnedInWave = 0;

  constructor(
    private readonly waveSpawnCounts: number[],
    private readonly totalWaves: number
  ) {}

  reset(): void {
    this.waveIndex = 0;
    this.spawnedInWave = 0;
  }

  getWaveNumber(): number {
    return Math.min(this.waveIndex + 1, this.totalWaves);
  }

  getTotalWaves(): number {
    return this.totalWaves;
  }

  getSpawnedInWave(): number {
    return this.spawnedInWave;
  }

  getSpawnTargetForWave(): number {
    return this.waveSpawnCounts[this.waveIndex] ?? 0;
  }

  spawnEnemyForSubstep(spawnEnemy: () => void): void {
    const target = this.getSpawnTargetForWave();
    if (this.spawnedInWave >= target) {
      return;
    }

    spawnEnemy();
    this.spawnedInWave += 1;
  }

  tryAdvanceIfCleared(aliveEnemyCount: number): WaveTransition {
    const target = this.getSpawnTargetForWave();
    const currentWaveFinished = this.spawnedInWave >= target && aliveEnemyCount === 0;
    if (!currentWaveFinished) {
      return "none";
    }

    if (this.waveIndex >= this.totalWaves - 1) {
      return "victory";
    }

    this.waveIndex += 1;
    this.spawnedInWave = 0;
    return "advanced";
  }
}
