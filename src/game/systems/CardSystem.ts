import { CardDefinition, CardInstance, CardType, DeckState } from "../types";

export interface DrawResult {
  drawn: number;
  burned: number;
}

export class CardSystem {
  private nextCardId = 1;

  createStartingDeck(
    definitions: Record<CardType, CardDefinition>,
    composition: Record<CardType, number>,
    handLimit: number
  ): DeckState {
    const drawPile: CardInstance[] = [];

    for (const type of Object.keys(composition) as CardType[]) {
      const count = composition[type];
      for (let i = 0; i < count; i += 1) {
        drawPile.push({
          id: this.nextCardId,
          ...definitions[type]
        });
        this.nextCardId += 1;
      }
    }

    shuffleInPlace(drawPile);

    return {
      drawPile,
      hand: [],
      discardPile: [],
      handLimit
    };
  }

  drawCards(deck: DeckState, count: number): DrawResult {
    let drawn = 0;
    let burned = 0;

    for (let i = 0; i < count; i += 1) {
      this.reshuffleIfNeeded(deck);
      const card = deck.drawPile.pop();
      if (!card) {
        break;
      }

      if (deck.hand.length < deck.handLimit) {
        deck.hand.push(card);
        drawn += 1;
      } else {
        deck.discardPile.push(card);
        burned += 1;
      }
    }

    return { drawn, burned };
  }

  findHandCard(deck: DeckState, cardId: number): CardInstance | null {
    return deck.hand.find((card) => card.id === cardId) ?? null;
  }

  playCard(deck: DeckState, cardId: number): CardInstance | null {
    const idx = deck.hand.findIndex((card) => card.id === cardId);
    if (idx === -1) {
      return null;
    }

    const [card] = deck.hand.splice(idx, 1);
    deck.discardPile.push(card);
    return card;
  }

  private reshuffleIfNeeded(deck: DeckState): void {
    if (deck.drawPile.length > 0 || deck.discardPile.length === 0) {
      return;
    }

    deck.drawPile = [...deck.discardPile];
    deck.discardPile = [];
    shuffleInPlace(deck.drawPile);
  }
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}
