import { v4 as uuidv4 } from "uuid";

import prisma from "@calcom/prisma";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { PartialReference } from "@calcom/types/EventManager";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";

import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";

interface Metadata {
  contact_id?: string | number;
  lang?: string;
  preferred_language?: string;
  org?: string;
}

const SerefinVideoApiAdapter = (): VideoApiAdapter => {
  return {
    /** Serefin doesn't need to return busy times, so we return empty */
    getAvailability: () => {
      return Promise.resolve([]);
    },
    createMeeting: async (event: CalendarEvent): Promise<VideoCallData> => {
      const appKeys = await getAppKeysFromSlug("serefinvideo");
      const uid: string = event.uid || "";
      const booking = await prisma.booking.findUnique({ where: { uid } });

      // Verificando se o metadata é um objeto válido.
      let metadata: Metadata = {};
      if (booking?.metadata && typeof booking.metadata === "object" && !Array.isArray(booking.metadata)) {
        metadata = booking.metadata as Metadata;
      }

      

      // Verificação para o campo contact_id
      let meetingId: string;
      if (typeof metadata.contact_id === "string" || typeof metadata.contact_id === "number") {
        meetingId = metadata.contact_id.toString();
      } else {
        meetingId = `unk-${uuidv4()}`;
      }

      const lang: string =
        typeof metadata.lang === "string"
          ? metadata.lang
          : typeof metadata.preferred_language === "string"
          ? metadata.preferred_language
          : "en";

      const duration: number = getDuration(event.endTime, event.startTime);
      const meetingType: string = typeof event.type === "string" ? event.type : "unknown";

      const clientUrl: string =
        typeof event.bookerUrl === "string"
          ? event.bookerUrl.replace(/^https?:\/\//, "")
          : typeof process.env.NEXT_PUBLIC_WEBAPP_URL === "string"
          ? process.env.NEXT_PUBLIC_WEBAPP_URL.replace(/^https?:\/\//, "")
          : "default-url";

      //Check if org parameter exists in metadata object
      const org = typeof metadata === "object" && "org" in metadata ? metadata.org ?? "" : "";
      if (org && typeof appKeys === "object" && appKeys !== null && !Array.isArray(appKeys)) {
        const videoUrl = Object.values(appKeys)
                          .map((val) => val.split("::"))
                          .find(([left]) => left === org)?.[1] ?? "";
        if (videoUrl) {
          return Promise.resolve({
            type: "serefin_video",
            id: meetingId,
            password: "",
            url: `https://${videoUrl}/?room=${meetingId}&lang=${lang}&duration=${duration}&type=${encodeURIComponent(
              meetingType
            )}`,
          });
        }
      }

      // Loop through appKeys and check the conditions
      if (typeof appKeys === "object" && appKeys !== null && !Array.isArray(appKeys)) {
        for (const [key, value] of Object.entries(appKeys as Record<string, string>)) {
          if (key && typeof value === "string" && value.includes("::")) {
            const [url, roomUrl] = value.split("::");
            if (url.replace(/^https?:\/\//, "") === clientUrl.replace(/^https?:\/\//, "")) {
              return Promise.resolve({
                type: "serefin_video",
                id: meetingId,
                password: "",
                url: `https://${roomUrl}/?room=${meetingId}&lang=${lang}&duration=${duration}&type=${encodeURIComponent(
                  meetingType
                )}`,
              });
            }
          }
        }


      } else {
        console.error("Invalid appKeys format", appKeys);
      }

      // Default response if no matching appKey found
      return Promise.resolve({
        type: "serefin_video",
        id: meetingId,
        password: "",
        url: `https://${clientUrl}/?room=${meetingId}&lang=${lang}&duration=${duration}&type=${encodeURIComponent(
          meetingType
        )}`,
      });
    },
    deleteMeeting: async (): Promise<void> => {
      Promise.resolve();
    },
    updateMeeting: (bookingRef: PartialReference): Promise<VideoCallData> => {
      return Promise.resolve({
        type: "serefin_video",
        id: bookingRef.meetingId as string,
        password: bookingRef.meetingPassword as string,
        url: bookingRef.meetingUrl as string,
      });
    },
  };
};

function getDuration(endTime: string, startTime: string) {
  const endT = new Date(endTime);
  const startT = new Date(startTime);
  return Math.abs(endT.getTime() - startT.getTime()) / (1000 * 60); // minutes
}

export default SerefinVideoApiAdapter;
