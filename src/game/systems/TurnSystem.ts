import { TurnState } from "../types";

export class TurnSystem {
  private state: TurnState = {
    turnNumber: 1,
    pendingEnemySubsteps: 0,
    actionTaken: false
  };

  reset(): void {
    this.state = {
      turnNumber: 1,
      pendingEnemySubsteps: 0,
      actionTaken: false
    };
  }

  getState(): TurnState {
    return this.state;
  }

  canTakeAction(): boolean {
    return !this.state.actionTaken && this.state.pendingEnemySubsteps === 0;
  }

  startAction(enemySubsteps: number): boolean {
    if (!this.canTakeAction() || enemySubsteps <= 0) {
      return false;
    }

    this.state.actionTaken = true;
    this.state.pendingEnemySubsteps = enemySubsteps;
    return true;
  }

  consumeEnemySubstep(): boolean {
    if (this.state.pendingEnemySubsteps <= 0) {
      return false;
    }

    this.state.pendingEnemySubsteps -= 1;
    return true;
  }

  finishEnemyPhase(): void {
    this.state.actionTaken = false;
    this.state.turnNumber += 1;
  }
}
