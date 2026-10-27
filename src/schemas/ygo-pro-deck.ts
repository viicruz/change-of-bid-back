//* Libraries imports
import { z } from "zod";

const DEFAULT_CARD_SEARCH_NUM = 32
const DEFAULT_CARD_SEARCH_OFFSET = 0

const binaryFlagSchema = z.union([z.literal(0), z.literal(1)])

export const cardSetSchema = z.object({
  set_name: z.string(),
  set_code: z.string(),
  set_rarity: z.string(),
  set_rarity_code: z.string(),
  set_price: z.string(),
})

export const cardImageSchema = z.object({
  id: z.coerce.number().int(),
  image_url: z.string(),
  image_url_small: z.string(),
  image_url_cropped: z.string().optional(),
})

export const cardPriceSchema = z.object({
  cardmarket_price: z.string(),
  tcgplayer_price: z.string(),
  ebay_price: z.string(),
  amazon_price: z.string(),
  coolstuffinc_price: z.string(),
})

export const banlistInfoSchema = z.object({
  ban_tcg: z.string().optional(),
  ban_ocg: z.string().optional(),
  ban_goat: z.string().optional(),
})

export const miscInfoSchema = z.object({
  beta_name: z.string().optional(),
  beta_id: z.coerce.number().optional(),
  staple: z.string().optional(),
  views: z.coerce.number(),
  viewsweek: z.coerce.number(),
  upvotes: z.coerce.number(),
  downvotes: z.coerce.number(),
  formats: z.array(z.string()),
  treated_as: z.string().optional(),
  tcg_date: z.string().optional(),
  ocg_date: z.string().optional(),
  konami_id: z.coerce.number().optional(),
  md_rarity: z.string().optional(),
  has_effect: binaryFlagSchema,
  question_atk: binaryFlagSchema.optional(),
  question_def: binaryFlagSchema.optional(),
  genesys_points: z.coerce.number().optional(),
  genesys_ocg_points: z.coerce.number().optional(),
})

export const cardSchema = z.object({
  id: z.coerce.number().int(),
  name: z.string(),
  type: z.string().nullable(),
  humanReadableCardType: z.string().nullable(),
  frameType: z.string().nullable(),
  desc: z.string().nullable(),
  pend_desc: z.string().optional().nullable(),
  monster_desc: z.string().optional().nullable(),
  race: z.string().optional().nullable(),
  archetype: z.string().optional().nullable(),
  attribute: z.string().optional().nullable(),
  atk: z.coerce.number().optional().nullable(),
  def: z.coerce.number().nullable().optional(),
  level: z.coerce.number().nullable().optional(),
  scale: z.coerce.number().optional().nullable(),
  linkval: z.coerce.number().optional().nullable(),
  linkmarkers: z.array(z.string()).optional().nullable(),
  typeline: z.array(z.string()).optional().nullable(),
  ygoprodeck_url: z.string().nullable(),
  banlist_info: banlistInfoSchema.optional().nullable(),
  card_sets: z.array(cardSetSchema).optional().nullable(),
  card_images: z.array(cardImageSchema).optional().nullable(),
  card_prices: z.array(cardPriceSchema).optional().nullable(),
  misc_info: z.array(miscInfoSchema).optional().nullable(),
})

export const cardInfoMetaSchema = z.object({
  generated: z.string().optional().nullable(),
  current_rows: z.coerce.number(),
  total_rows: z.coerce.number(),
  rows_remaining: z.coerce.number(),
  total_pages: z.coerce.number().optional(),
  pages_remaining: z.coerce.number().optional(),
  next_page: z.string().optional(),
  next_page_offset: z.coerce.number().optional(),
})

export const cardInfoSuccessSchema = z.object({
  data: z.array(cardSchema),
  meta: cardInfoMetaSchema.optional(),
})

export const cardInfoPageSchema = cardInfoSuccessSchema.extend({
  meta: cardInfoMetaSchema,
})

export const cardInfoErrorSchema = z.object({
  error: z.string(),
})

export const cardInfoResponseSchema = z.union([cardInfoSuccessSchema, cardInfoErrorSchema])

const stringOrListSchema = z.union([
  z.string(),
  z.array(z.string()).readonly(),
])

const numberOrListSchema = z.union([
  z.coerce.number(),
  z.array(z.coerce.number()).readonly(),
])

export const comparisonOperatorSchema = z.enum(["lt", "lte", "gt", "gte"])

export const numericFilterSchema = z.union([
  z.coerce.number(),
  z.object({
    operator: comparisonOperatorSchema,
    value: z.coerce.number(),
  }),
])

export const cardSearchQuerySchema = z.object({
  name: stringOrListSchema.optional(),
  fname: z.string().optional(),
  id: numberOrListSchema.optional(),
  type: stringOrListSchema.optional(),
  atk: numericFilterSchema.optional(),
  def: numericFilterSchema.optional(),
  level: numericFilterSchema.optional(),
  race: stringOrListSchema.optional(),
  attribute: stringOrListSchema.optional(),
  link: z.coerce.number().optional(),
  linkmarker: stringOrListSchema.optional(),
  scale: z.coerce.number().optional(),
  cardset: z.string().optional(),
  archetype: z.string().optional(),
  banlist: z.enum(["tcg", "ocg", "goat"]).optional(),
  sort: z.enum(["atk", "def", "name", "type", "level", "id", "new"]).optional(),
  format: z.enum([
    "tcg",
    "goat",
    "ocg goat",
    "speed duel",
    "master duel",
    "rush duel",
    "duel links",
    "genesys",
    "genesys ocg",
  ]).optional(),
  misc: z.boolean().optional(),
  staple: z.boolean().optional(),
  has_effect: z.boolean().optional(),
  startdate: z.string().optional(),
  enddate: z.string().optional(),
  dateregion: z.enum(["tcg", "ocg"]).optional(),
  language: z.enum(["fr", "de", "it", "pt"]).optional(),
  num: z.coerce.number().default(DEFAULT_CARD_SEARCH_NUM),
  offset: z.coerce.number().default(DEFAULT_CARD_SEARCH_OFFSET),
}).refine(
  (query) => query.name === undefined || query.id === undefined,
  "name and id cannot be used together",
)

export type CardSet = z.infer<typeof cardSetSchema>
export type CardImage = z.infer<typeof cardImageSchema>
export type CardPrice = z.infer<typeof cardPriceSchema>
export type BanlistInfo = z.infer<typeof banlistInfoSchema>
export type MiscInfo = z.infer<typeof miscInfoSchema>
export type Card = z.infer<typeof cardSchema>
export type CardInfoMeta = z.infer<typeof cardInfoMetaSchema>
export type CardInfoSuccess = z.infer<typeof cardInfoSuccessSchema>
export type CardInfoPage = z.infer<typeof cardInfoPageSchema>
export type CardInfoError = z.infer<typeof cardInfoErrorSchema>
export type CardInfoResponse = z.infer<typeof cardInfoResponseSchema>
export type ComparisonOperator = z.infer<typeof comparisonOperatorSchema>
export type NumericFilter = z.infer<typeof numericFilterSchema>
export type CardSearchQuery = z.infer<typeof cardSearchQuerySchema>
export type CardSearchQueryInput = z.input<typeof cardSearchQuerySchema>