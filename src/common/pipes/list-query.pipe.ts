import {
  applyDecorators,
  BadRequestException,
  PipeTransform,
} from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { isISO8601, isUUID } from 'class-validator';

type QueryField = 'uuid' | 'boolean' | 'date' | 'text' | readonly string[];
type QueryFields = Record<string, QueryField>;

export function ApiListQuery(
  fields: QueryFields,
  maxLimit = 500,
  defaultLimit = 100,
) {
  return applyDecorators(
    ...Object.entries(fields).map(([name, field]) =>
      ApiQuery({
        name,
        required: false,
        schema:
          field === 'boolean'
            ? { type: 'boolean', default: true }
            : field === 'uuid'
              ? { type: 'string', format: 'uuid' }
              : field === 'text'
                ? { type: 'string', maxLength: 200 }
                : field === 'date'
                  ? {
                      type: 'string',
                      description:
                        'Fecha ISO 8601 válida; desde debe ser anterior o igual a hasta.',
                    }
                  : { type: 'string', enum: [...field] },
      }),
    ),
    ApiQuery({
      name: 'limite',
      required: false,
      schema: {
        type: 'integer',
        minimum: 1,
        maximum: maxLimit,
        default: defaultLimit,
      },
    }),
  );
}

/** Explicit query contracts reject coercion, repeated values and unbounded lists. */
export class ListQueryPipe implements PipeTransform {
  constructor(
    private readonly fields: QueryFields,
    private readonly maxLimit = 500,
    private readonly defaultLimit = 100,
  ) {}

  transform(input: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { limite: this.defaultLimit };
    for (const [key, value] of Object.entries(input)) {
      if (key !== 'limite' && !Object.hasOwn(this.fields, key)) {
        throw new BadRequestException(`Parámetro desconocido: ${key}.`);
      }
      if (typeof value !== 'string' || value.length === 0) {
        throw new BadRequestException(
          `${key} debe tener un único valor válido.`,
        );
      }
      if (key === 'limite') {
        const limit = Number(value);
        if (
          !/^\d+$/.test(value) ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > this.maxLimit
        ) {
          throw new BadRequestException(
            `limite debe ser un entero entre 1 y ${this.maxLimit}.`,
          );
        }
        result[key] = limit;
        continue;
      }
      const field = this.fields[key];
      const valid =
        field === 'uuid'
          ? isUUID(value)
          : field === 'boolean'
            ? value === 'true' || value === 'false'
            : field === 'date'
              ? isISO8601(value, { strict: true, strictSeparator: true }) &&
                Number.isFinite(Date.parse(value))
              : field === 'text'
                ? value.length <= 200
                : Array.isArray(field) && field.includes(value);
      if (!valid) throw new BadRequestException(`${key} no es válido.`);
      result[key] = field === 'boolean' ? value === 'true' : value;
    }
    if (
      typeof result.desde === 'string' &&
      typeof result.hasta === 'string' &&
      Date.parse(result.desde) > Date.parse(result.hasta)
    ) {
      throw new BadRequestException('desde no puede ser posterior a hasta.');
    }
    return result;
  }
}

export interface ListQuery {
  adultoId?: string;
  medicamentoId?: string;
  usuarioId?: string;
  actorId?: string;
  soloActivos?: boolean;
  soloActivas?: boolean;
  incluirCanceladas?: boolean;
  desde?: string;
  hasta?: string;
  estado?: string;
  entidad?: string;
  entidadId?: string;
  accion?: string;
  limite: number;
}
