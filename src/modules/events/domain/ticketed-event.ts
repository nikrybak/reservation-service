import { Money } from '../../../shared/domain/money';
import { EventClosedForSalesError, InvalidSeatMapError } from './errors';
import {
  LABEL_PATTERN,
  MAX_PRICING_TIERS,
  MAX_ROWS_PER_SECTION,
  MAX_SEATS_PER_EVENT,
  MAX_SEATS_PER_ROW,
  MAX_SECTIONS_PER_EVENT,
} from './limits';
import { PricingTier } from './pricing-tier';
import { Seat } from './seat';
import { SeatId } from './seat-id';

export interface RowLayout {
  readonly name: string;
  readonly tierCode: string;
  readonly seatCount: number;
}

export interface SectionLayout {
  readonly name: string;
  readonly rows: readonly RowLayout[];
}

export interface PricingTierInput {
  readonly code: string;
  readonly name: string;
  readonly priceMinor: number;
}

export interface CreateTicketedEventInput {
  readonly id: string;
  readonly name: string;
  readonly venue: string;
  readonly startsAt: Date;
  readonly currency: string;
  readonly pricingTiers: readonly PricingTierInput[];
  readonly sections: readonly SectionLayout[];
}

export interface TicketedEventState {
  readonly id: string;
  readonly name: string;
  readonly venue: string;
  readonly startsAt: Date;
  readonly currency: string;
  readonly pricingTiers: readonly PricingTier[];
  readonly sections: readonly SectionLayout[];
  readonly createdAt: Date;
}

export class TicketedEvent {
  private readonly tiersByCode: ReadonlyMap<string, PricingTier>;

  private constructor(private readonly state: TicketedEventState) {
    this.tiersByCode = new Map(state.pricingTiers.map((tier) => [tier.code, tier]));
  }

  /** Creates the event together with its seat inventory, which is stored per seat. */
  static create(input: CreateTicketedEventInput, now: Date): { event: TicketedEvent; seats: Seat[] } {
    if (input.startsAt <= now) {
      throw new InvalidSeatMapError('Event must start in the future', {
        startsAt: input.startsAt.toISOString(),
      });
    }

    const pricingTiers = TicketedEvent.buildTiers(input.pricingTiers, input.currency);
    const tierCodes = new Set(pricingTiers.map((tier) => tier.code));
    TicketedEvent.assertValidLayout(input.sections, tierCodes);

    const event = new TicketedEvent({
      id: input.id,
      name: input.name.trim(),
      venue: input.venue.trim(),
      startsAt: input.startsAt,
      currency: input.currency,
      pricingTiers,
      sections: input.sections,
      createdAt: now,
    });
    return { event, seats: event.generateSeats() };
  }

  static restore(state: TicketedEventState): TicketedEvent {
    return new TicketedEvent(state);
  }

  get id(): string {
    return this.state.id;
  }

  get currency(): string {
    return this.state.currency;
  }

  get sections(): readonly SectionLayout[] {
    return this.state.sections;
  }

  get pricingTiers(): readonly PricingTier[] {
    return this.state.pricingTiers;
  }

  priceOf(tierCode: string): Money {
    const tier = this.tiersByCode.get(tierCode);
    if (!tier) {
      throw new InvalidSeatMapError('Seat references an unknown pricing tier', { tierCode });
    }
    return tier.price;
  }

  assertOpenForSales(now: Date): void {
    if (now >= this.state.startsAt) {
      throw new EventClosedForSalesError(this.state.id);
    }
  }

  snapshot(): TicketedEventState {
    return this.state;
  }

  private generateSeats(): Seat[] {
    return this.state.sections.flatMap((section) =>
      section.rows.flatMap((row) =>
        Array.from({ length: row.seatCount }, (_, index) =>
          Seat.create(this.state.id, SeatId.of(section.name, row.name, index + 1), row.tierCode),
        ),
      ),
    );
  }

  private static buildTiers(inputs: readonly PricingTierInput[], currency: string): PricingTier[] {
    if (inputs.length === 0 || inputs.length > MAX_PRICING_TIERS) {
      throw new InvalidSeatMapError(`An event needs between 1 and ${MAX_PRICING_TIERS} pricing tiers`);
    }
    const tiers = inputs.map((tier) =>
      PricingTier.create(tier.code, tier.name, Money.of(tier.priceMinor, currency)),
    );
    assertUnique(
      tiers.map((tier) => tier.code),
      'Pricing tier codes must be unique',
    );
    return tiers;
  }

  private static assertValidLayout(
    sections: readonly SectionLayout[],
    tierCodes: ReadonlySet<string>,
  ): void {
    if (sections.length === 0 || sections.length > MAX_SECTIONS_PER_EVENT) {
      throw new InvalidSeatMapError(`An event needs between 1 and ${MAX_SECTIONS_PER_EVENT} sections`);
    }
    assertUnique(
      sections.map((section) => section.name),
      'Section names must be unique',
    );

    let totalSeats = 0;
    for (const section of sections) {
      assertLabel(section.name, 'section');
      if (section.rows.length === 0 || section.rows.length > MAX_ROWS_PER_SECTION) {
        throw new InvalidSeatMapError(
          `Section ${section.name} needs between 1 and ${MAX_ROWS_PER_SECTION} rows`,
        );
      }
      assertUnique(
        section.rows.map((row) => row.name),
        `Row names must be unique within section ${section.name}`,
      );
      for (const row of section.rows) {
        assertLabel(row.name, 'row');
        if (!tierCodes.has(row.tierCode)) {
          throw new InvalidSeatMapError('Row references an unknown pricing tier', {
            section: section.name,
            row: row.name,
            tierCode: row.tierCode,
          });
        }
        if (!Number.isInteger(row.seatCount) || row.seatCount < 1 || row.seatCount > MAX_SEATS_PER_ROW) {
          throw new InvalidSeatMapError(`A row holds between 1 and ${MAX_SEATS_PER_ROW} seats`, {
            section: section.name,
            row: row.name,
          });
        }
        totalSeats += row.seatCount;
      }
    }

    if (totalSeats > MAX_SEATS_PER_EVENT) {
      throw new InvalidSeatMapError(`An event holds at most ${MAX_SEATS_PER_EVENT} seats`, {
        totalSeats,
      });
    }
  }
}

function assertUnique(values: readonly string[], message: string): void {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) {
    throw new InvalidSeatMapError(message, { duplicates: [...new Set(duplicates)] });
  }
}

function assertLabel(label: string, kind: 'section' | 'row'): void {
  if (!LABEL_PATTERN.test(label)) {
    throw new InvalidSeatMapError(`Invalid ${kind} label "${label}"`, { label });
  }
}
