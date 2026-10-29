import "server-only";
import { prisma } from "./db";
import { isCardCode } from "./card-code";
import { isSafeRedirectUrl } from "./urls";

export type CardTarget =
  | { kind: "profile"; url: string; cardId: string; profileId: string; organizationId: string }
  | { kind: "fallback"; url: string }
  | { kind: "none" };

/**
 * A dónde lleva una tarjeta. Sin caché a propósito: una reasignación o una
 * desactivación debe surtir efecto en el siguiente escaneo (es una búsqueda por
 * índice único, barata).
 */
export async function resolveCardTarget(code: string): Promise<CardTarget> {
  if (!isCardCode(code)) return { kind: "none" };
  const card = await prisma.card.findUnique({
    where: { code },
    select: {
      id: true,
      status: true,
      organizationId: true,
      organization: { select: { status: true, fallbackUrl: true } },
      profile: { select: { id: true, status: true, publicUrl: true } },
    },
  });
  if (!card || card.organization.status !== "ACTIVE") return { kind: "none" };

  const { profile } = card;
  if (card.status === "ACTIVE" && profile?.status === "ACTIVE" && isSafeRedirectUrl(profile.publicUrl)) {
    return {
      kind: "profile",
      url: profile.publicUrl,
      cardId: card.id,
      profileId: profile.id,
      organizationId: card.organizationId,
    };
  }
  // Tarjeta desactivada o sin asignar: a la página de la empresa, no a un error.
  if (isSafeRedirectUrl(card.organization.fallbackUrl)) {
    return { kind: "fallback", url: card.organization.fallbackUrl };
  }
  return { kind: "none" };
}
