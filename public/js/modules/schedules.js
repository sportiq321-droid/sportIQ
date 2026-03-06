// js/modules/schedules.js
// Backend-integrated schedule management

import API from "../api.js";

/* Create a schedule */
export async function addSchedule({
  coachId,
  sport,
  date,
  startTime,
  endTime,
  venue,
  entrance,
}) {
  try {
    const schedule = await API.createSchedule({
      sport,
      date,
      startTime,
      endTime,
      venue,
      entrance,
    });
    return schedule;
  } catch (error) {
    console.error("Failed to create schedule:", error);
    throw error;
  }
}

/* List schedules created by this coach (newest first) */
export async function listSchedulesByCoach(coachId) {
  try {
    const response = await API.getCoachSchedules(coachId);
    return response.items || [];
  } catch (error) {
    console.error("Failed to fetch schedules:", error);
    return [];
  }
}

/* List requests for a schedule (optionally by status) */
export async function listRequestsBySchedule(scheduleId, status = "PENDING") {
  try {
    const response = await API.getScheduleRequests(scheduleId, status);
    return response.items || [];
  } catch (error) {
    console.error("Failed to fetch requests:", error);
    return [];
  }
}

/* Approve/Reject a request */
export async function setRequestStatus(requestId, status) {
  try {
    await API.updateRequestStatus(requestId, status);
    return true;
  } catch (error) {
    console.error("Failed to update request status:", error);
    return false;
  }
}
