import { v4 as uuidv4 } from "uuid";

import prisma from "@calcom/prisma";
import type { GetAccessLinkResponseSchema, GetRecordingsResponseSchema } from "@calcom/prisma/zod-utils";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { PartialReference } from "@calcom/types/EventManager";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";

import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";

const SerefinVideoApiAdapter = (): VideoApiAdapter => {
  return {
    /** Serefin doesn't need to return busy times, so we return empty */
    getAvailability: () => {
      return Promise.resolve([]);
    },
    createMeeting: async (event: CalendarEvent): Promise<VideoCallData> => {
      const appKeys = await getAppKeysFromSlug("serefinvideo");

      const booking = await prisma.booking.findUnique({ where: { uid: event.uid } });

      // Recuperar metadata do booking
      const metadata = booking?.metadata || {};
      const meetingId = metadata.contact_id?.toString() || `unk-${uuidv4()}`;

      const lang = metadata.lang || metadata.preferred_language || "en";
      const duration = getDuration(event.endTime, event.startTime);
      const meetingType = event.type;

      const clientUrl = event.bookerUrl || NEXT_PUBLIC_WEBAPP_URL;

      // Loop through appKeys and check the conditions
      for (const [key, value] of Object.entries(appKeys)) {
        if (value && value.includes("::")) {
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
    deleteMeeting: async (uid: string): Promise<void> => {
      return Promise.resolve([]);
    },
    updateMeeting: (bookingRef: PartialReference, event: CalendarEvent): Promise<VideoCallData> => {
      return Promise.resolve({
        type: "serefin_video",
        id: bookingRef.meetingId as string,
        password: bookingRef.meetingPassword as string,
        url: bookingRef.meetingUrl as string,
      });
    },
    getRecordings: async (roomName: string): Promise<GetRecordingsResponseSchema> => {
      return Promise.resolve([]);
    },
    getRecordingDownloadLink: async (recordingId: string): Promise<GetAccessLinkResponseSchema> => {
      return Promise.resolve([]);
    },
  };
};

function getDuration(endTime: string, startTime: string) {
  const endT = new Date(endTime);
  const startT = new Date(startTime);
  return Math.abs(endT.getTime() - startT.getTime()) / (1000 * 60); // minutes
}

export default SerefinVideoApiAdapter;
