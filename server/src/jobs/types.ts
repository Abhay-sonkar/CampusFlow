// Every kind of background job and the data it carries.
// Jobs carry ids, not whole documents: the worker reads fresh data when it runs.
export interface JobData {
  'notice.published': { noticeId: string };
  'complaint.updated': { complaintId: string; actorId: string; status: string };
  'booking.decided': { bookingId: string };
  'opportunity.created': { opportunityId: string };
  'deadlines.scan': Record<string, never>;
  'email.send': { to: string; subject: string; text: string };
}

export type JobName = keyof JobData;
