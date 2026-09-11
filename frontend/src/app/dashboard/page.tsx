"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { employeesApi, DashboardStats, EmployeeListItem, TaskRecord, MeetingRecord, PaginatedTasks, PaginatedMeetings, PaginatedResponse, ActivityFeedItem } from "@/lib/employeeApi";
import { isStaffRole } from "@/lib/auth";

const barShades = ["bg-primary-500", "bg-primary-300", "bg-primary-400", "bg-primary-500", "bg-primary-300", "bg-primary-400", "bg-primary-500"];

const taskIconStyles = [
  "bg-blue-50 text-blue-500",
  "bg-primary-50 text-primary-500",
  "bg-orange-50 text-orange-500",
  "bg-green-50 text-green-500",
];

const taskIcons = [
  "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
  "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  "M13 10V3L4 14h7v7l9-11h-7z",
];

const badgeStyles: Record<string, string> = {
  Active: "bg-green-50 text-green-600",
  "On Leave": "bg-yellow-50 text-yellow-600",
  Inactive: "bg-red-50 text-red-500",
};

export default function DashboardPage() {
  const [role, setRole] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentData, setRecentData] = useState<PaginatedResponse | null>(null);
  const [recentPage, setRecentPage] = useState(1);
  const [tasksData, setTasksData] = useState<PaginatedTasks | null>(null);
  const [tasksPage, setTasksPage] = useState(1);
  const [meetingsData, setMeetingsData] = useState<PaginatedMeetings | null>(null);
  const [meetingsPage, setMeetingsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [todayStatus, setTodayStatus] = useState<{ checked_in: boolean; check_in: string | null; check_out: string | null } | null>(null);
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [clockBusy, setClockBusy] = useState(false);
  const [clockMsg, setClockMsg] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityFeedItem[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("role");
    if (stored) setRole(stored);
  }, []);

  const isStaff = isStaffRole(role);

  useEffect(() => {
    async function load() {
      try {
        const me = await employeesApi.getMyAttendanceStatus();
        setSelectedEmpId(me.id);
        setMyName(me.full_name);
        setTodayStatus({ checked_in: me.checked_in, check_in: me.check_in, check_out: me.check_out });
        if (isStaff) {
          const s = await employeesApi.stats();
          setStats(s);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isStaff]);

  useEffect(() => {
    if (!isStaff) return;
    let cancelled = false;
    const loadActivity = async () => {
      try {
        const items = await employeesApi.getActivityFeed(8);
        if (!cancelled) setActivity(items);
      } catch (e) {
        console.error(e);
      }
    };
    loadActivity();
    const interval = setInterval(loadActivity, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isStaff]);

  const fetchRecent = useCallback(async (page: number) => {
    if (!isStaff) return;
    try {
      const params = new URLSearchParams({ page: page.toString(), per_page: "3", sort_by: "id", sort_order: "desc" });
      const data = await employeesApi.list(params);
      setRecentData(data);
    } catch (e) { console.error(e); }
  }, [isStaff]);

  const fetchTasks = useCallback(async (page: number) => {
    try {
      const params = new URLSearchParams({ page: page.toString(), per_page: "4" });
      const data = await employeesApi.getTasks(params);
      setTasksData(data);
    } catch (e) { console.error(e); }
  }, []);

  const fetchMeetings = useCallback(async (page: number) => {
    try {
      const params = new URLSearchParams({ page: page.toString(), per_page: "1" });
      const data = await employeesApi.getMeetings(params);
      setMeetingsData(data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchRecent(recentPage);
  }, [recentPage, fetchRecent]);

  useEffect(() => {
    fetchTasks(tasksPage);
  }, [tasksPage, fetchTasks]);

  useEffect(() => {
    fetchMeetings(meetingsPage);
  }, [meetingsPage, fetchMeetings]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchTodayStatus = useCallback(async () => {
    if (selectedEmpId == null) return;
    try {
      const data = await employeesApi.getTodayAttendance(selectedEmpId);
      setTodayStatus(data);
    } catch (e) {
      console.error(e);
    }
  }, [selectedEmpId]);

  useEffect(() => {
    fetchTodayStatus();
  }, [fetchTodayStatus]);

  const handleCheckIn = async () => {
    if (selectedEmpId == null) return;
    setClockBusy(true);
    try {
      const res = await employeesApi.checkIn(selectedEmpId);
      await fetchTodayStatus();
      setClockMsg(res?.message || "Checked in successfully");
    } catch (e: any) {
      setClockMsg(e?.response?.data?.detail || "Check-in failed");
    } finally {
      setClockBusy(false);
      setTimeout(() => setClockMsg(null), 3500);
    }
  };

  const handleCheckOut = async () => {
    if (selectedEmpId == null) return;
    setClockBusy(true);
    try {
      const res = await employeesApi.checkOut(selectedEmpId);
      await fetchTodayStatus();
      setClockMsg(res?.message || "Checked out successfully");
    } catch (e: any) {
      setClockMsg(e?.response?.data?.detail || "Check-out failed");
    } finally {
      setClockBusy(false);
      setTimeout(() => setClockMsg(null), 3500);
    }
  };

  const attendanceTotal = stats
    ? stats.attendance_today.present + stats.attendance_today.absent + stats.attendance_today.leave + stats.attendance_today.late
    : 0;
  const attendancePct = attendanceTotal ? Math.round((stats!.attendance_today.present / attendanceTotal) * 100) : 0;

  const upcomingTasks = tasksData?.records || [];
  const latestMeeting = meetingsData?.records?.[0] || null;
  const recent = recentData?.employees || [];

  return (
    <DashboardLayout>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 px-1">
        <div>
          <h1 className="text-[26px] leading-tight font-bold text-gray-900">Dashboard</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">A quick view of your team and company updates.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
        </div>
      ) : (
        <>
          {/* ===== Row 1: Stat cards (staff view) ===== */}
          {isStaff && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-4">
            <div className="bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 rounded-[18px] p-5 text-white shadow-lg shadow-primary-200">
              <p className="text-xs font-medium text-primary-100">Total Employees</p>
              <p className="text-[32px] font-bold mt-1.5 leading-none">{stats?.total_employees}</p>
              <div className="mt-7">
                <span className="inline-flex items-center gap-1.5 bg-white/20 rounded-lg px-2.5 py-1.5">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <span className="text-[10px] font-medium">{stats?.active} active now</span>
                </span>
              </div>
            </div>

            <WhiteStatCard label="Present Today" value={stats?.attendance_today.present ?? 0} badge={`${attendancePct}% attendance`} icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            <WhiteStatCard label="Late Today" value={stats?.attendance_today.late ?? 0} badge="Checked in late" icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            <WhiteStatCard label="On Leave" value={stats?.on_leave ?? 0} badge={`${stats?.pending_leaves ?? 0} pending requests`} icon="M12 3v1m0 16v1m9-9h-1M4 12H3m15.36 6.36l-.7-.7m-12.72 0l-.7.7m12.72-12.72l-.7.7m-12.72 0l-.7-.7M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            <WhiteStatCard label="Departments" value={stats?.departments.length ?? 0} badge="Across company" icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </div>
          )}

          {/* ===== Row 2 ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* Bar chart card (staff view) */}
            {isStaff && stats && (
            <div className="bg-white rounded-[18px] p-5">
              <h3 className="text-[13px] font-bold text-gray-900">Employees by Department</h3>
              <div className="flex items-end justify-between gap-1.5 h-[150px] mt-5 px-1">
                {stats.departments.map((d, i) => {
                  const max = Math.max(...stats.departments.map((x) => x.count));
                  const h = Math.max(18, (d.count / max) * 100);
                  return (
                    <div key={d.name} className="flex flex-col items-center gap-2.5 flex-1 h-full justify-end">
                      <div
                        className={`w-6 sm:w-7 rounded-full relative ${barShades[i % barShades.length]}`}
                        style={{ height: `${h}%` }}
                      >
                        <span className="absolute top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white rounded-full shadow"></span>
                      </div>
                      <span className="text-[9px] text-gray-300 font-semibold">{d.name.slice(0, 1)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            )}

            {/* Meeting card - server-side paginated */}
            <div className="bg-gradient-to-br from-primary-500 via-primary-500 to-primary-600 rounded-[18px] p-5 flex flex-col text-white shadow-lg shadow-primary-200">
              {latestMeeting ? (
                <>
                  <p className="text-[10px] font-medium text-primary-200 uppercase tracking-wider">{latestMeeting.title}</p>
                  <p className="text-[17px] font-bold leading-snug mt-3">{latestMeeting.description}</p>
                  <p className="text-[11px] text-primary-200 mt-2">{latestMeeting.meeting_date} &middot; {latestMeeting.meeting_time} &middot; {latestMeeting.location}</p>
                </>
              ) : (
                <>
                  <p className="text-[10px] font-medium text-primary-200 uppercase tracking-wider">No Meeting</p>
                  <p className="text-[17px] font-bold leading-snug mt-3">No upcoming meetings</p>
                </>
              )}
              <div className="mt-auto pt-5 flex items-center justify-between">
                <button>
                  <span className="inline-flex items-center gap-1.5 bg-white hover:bg-primary-50 text-primary-600 text-[11px] font-semibold px-4 py-2.5 rounded-full transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Join Meeting
                  </span>
                </button>
                {meetingsData && meetingsData.total_pages > 1 && (
                  <div className="flex gap-1">
                    <button onClick={() => setMeetingsPage(Math.max(1, meetingsPage - 1))} disabled={meetingsPage === 1} className="w-6 h-6 rounded bg-white/20 flex items-center justify-center disabled:opacity-40">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button onClick={() => setMeetingsPage(Math.min(meetingsData.total_pages, meetingsPage + 1))} disabled={meetingsPage === meetingsData.total_pages} className="w-6 h-6 rounded bg-white/20 flex items-center justify-center disabled:opacity-40">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Tasks card - server-side paginated */}
            <div className="bg-white rounded-[18px] p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-bold text-gray-900">Upcoming Tasks</h3>
                <span className="text-[10px] font-semibold text-primary-500 bg-primary-50 rounded-full px-2.5 py-1">+ New</span>
              </div>
              <div className="space-y-1">
                {upcomingTasks.length > 0 ? (
                  upcomingTasks.map((t, i) => (
                    <div key={t.id} className="flex items-center gap-2.5 py-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${taskIconStyles[i % taskIconStyles.length]}`}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d={taskIcons[i % taskIcons.length]} />
                        </svg>
                      </div>
                      <span className="text-xs font-medium text-gray-700 flex-1 truncate">{t.title}</span>
                      <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${t.tag_color}`}>{t.tag}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-400 py-4 text-center">No pending tasks</p>
                )}
              </div>
              {tasksData && tasksData.total_pages > 1 && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <p className="text-[10px] text-gray-400">Page {tasksPage}/{tasksData.total_pages}</p>
                  <div className="flex gap-1">
                    <button onClick={() => setTasksPage(Math.max(1, tasksPage - 1))} disabled={tasksPage === 1} className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center disabled:opacity-40">
                      <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button onClick={() => setTasksPage(Math.min(tasksData.total_pages, tasksPage + 1))} disabled={tasksPage === tasksData.total_pages} className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center disabled:opacity-40">
                      <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ===== Row 3 ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Recently joined - server-side paginated (staff view) */}
            {isStaff && (
            <div className="bg-white rounded-[18px] p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[13px] font-bold text-gray-900">Recently Joined</h3>
              </div>
              <div>
                {recent.map((emp) => (
                  <Link key={emp.id} href={`/employees/${emp.employee_id}`} className="flex items-center gap-3 py-2.5 group">
                    <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {emp.first_name[0]}{emp.last_name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate group-hover:text-primary-600 transition-colors">{emp.first_name} {emp.last_name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{emp.designation}, {emp.department}</p>
                    </div>
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${badgeStyles[emp.employment_status] || "bg-gray-100 text-gray-500"}`}>
                      {emp.employment_status}
                    </span>
                  </Link>
                ))}
              </div>
              {recentData && recentData.total_pages > 1 && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <p className="text-[10px] text-gray-400">Page {recentPage}/{recentData.total_pages}</p>
                  <div className="flex gap-1">
                    <button onClick={() => setRecentPage(Math.max(1, recentPage - 1))} disabled={recentPage === 1} className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center disabled:opacity-40">
                      <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button onClick={() => setRecentPage(Math.min(recentData.total_pages, recentPage + 1))} disabled={recentPage === recentData.total_pages} className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center disabled:opacity-40">
                      <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Attendance donut (staff view) */}
            {isStaff && (
            <div className="bg-white rounded-[18px] p-5">
              <h3 className="text-[13px] font-bold text-gray-900 mb-4">Attendance Overview</h3>
              <div className="flex flex-col items-center">
                <div className="relative w-[130px] h-[130px]">
                  <div
                    className="w-full h-full rounded-full"
                    style={{
                      background: `conic-gradient(#8b5cf6 0deg ${attendancePct * 3.6}deg, #c4b5fd ${attendancePct * 3.6}deg ${(attendancePct + Math.max(2, 100 - attendancePct - Math.round(((stats?.attendance_today.leave ?? 0) / attendanceTotal) * 100))) * 3.6}deg, #ede9fe 0deg 360deg)`,
                    }}
                  ></div>
                  <div className="absolute inset-[14px] bg-white rounded-full flex flex-col items-center justify-center">
                    <span className="text-[22px] font-bold text-gray-900 leading-none">{attendancePct}%</span>
                    <span className="text-[10px] text-gray-400 mt-1">Present</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-5">
                  <DonutLegend color="bg-primary-500" label="Present" value={stats?.attendance_today.present ?? 0} />
                  <DonutLegend color="bg-primary-300" label="Absent" value={stats?.attendance_today.absent ?? 0} />
                  <DonutLegend color="bg-primary-100" label="Leave" value={stats?.attendance_today.leave ?? 0} />
                </div>
              </div>
            </div>
            )}

            {/* Clock + Check-in/out card */}
            <div className="bg-[#1D1D2B] rounded-[18px] p-5 text-white flex flex-col">
              <p className="text-xs font-medium text-gray-300">Office Time:</p>
              <div className="flex-1 flex flex-col justify-center py-3">
                <p className="text-[34px] font-bold tabular-nums leading-none tracking-wide">
                  {clock.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                  <span className="text-primary-400">:{String(clock.getSeconds()).padStart(2, "0")}</span>
                </p>
                <p className="text-[10px] text-gray-500 mt-2.5">
                  {clock.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} &middot; 9:00 AM - 5:00 PM shift
                </p>
                {myName && <p className="text-[10px] text-primary-300 mt-1 font-medium">Signed in as {myName}</p>}
              </div>
              <div className="flex gap-2.5 mt-2">
                {todayStatus?.checked_in && !todayStatus.check_out ? (
                  <button onClick={handleCheckOut} disabled={selectedEmpId == null || clockBusy} className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white text-[11px] font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                    {clockBusy ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    )}
                    Check Out ({todayStatus.check_out})
                  </button>
                ) : (
                  <button onClick={handleCheckIn} disabled={selectedEmpId == null || clockBusy || !!todayStatus?.checked_in} className="flex-1 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white text-[11px] font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                    {clockBusy ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                    )}
                    {todayStatus?.checked_in ? `Checked In (${todayStatus.check_in})` : "Check In"}
                  </button>
                )}
              </div>
              {todayStatus?.checked_in && (
                <p className="text-[9px] text-gray-500 mt-2 text-center">
                  In: {todayStatus.check_in} {todayStatus.check_out ? `| Out: ${todayStatus.check_out}` : ""}
                </p>
              )}
              {clockMsg && (
                <p className="text-[10px] mt-2 text-center px-2 py-1 rounded-lg bg-white/10 text-primary-200">
                  {clockMsg}
                </p>
              )}
            </div>
          </div>

          {/* ===== Recent activity feed (staff view) ===== */}
          {isStaff && (
          <div className="bg-white rounded-[18px] p-5 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[13px] font-bold text-gray-900">Recent Activity</h3>
              <span className="flex items-center gap-1.5 text-[9px] font-semibold text-primary-500 bg-primary-50 rounded-full px-2 py-0.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary-500"></span>
                </span>
                LIVE
              </span>
            </div>
            {activity.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-6">No recent activity yet.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-[7px] top-1 bottom-1 w-px bg-gray-100"></div>
                <div className="space-y-0">
                  {activity.map((a) => (
                    <div key={a.id} className="relative flex items-start gap-3 py-2.5 pl-0">
                      <span className="absolute left-0 top-4 w-[15px] h-[15px] rounded-full border-2 border-primary-200 bg-white"></span>
                      <div className="pl-7 flex-1 min-w-0">
                        <p className="text-xs text-gray-700 leading-snug">{a.action}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {a.performed_by || a.employee_id}
                          {a.department ? ` · ${a.department}` : ""}
                          {a.timestamp ? ` · ${new Date(a.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}
        </>
      )}
    </DashboardLayout>
  );
}

function WhiteStatCard({ label, value, badge, icon }: { label: string; value: number; badge: string; icon: string }) {
  return (
    <div className="bg-white rounded-[18px] p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-gray-500 pt-0.5">{label}</p>
        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
      </div>
      <p className="text-[32px] font-bold text-gray-900 mt-1.5 leading-none">{value}</p>
      <div className="mt-7">
        <span className="inline-flex items-center gap-1.5 bg-gray-50 rounded-lg px-2.5 py-1.5">
          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <span className="text-[10px] font-medium text-gray-500">{badge}</span>
        </span>
      </div>
    </div>
  );
}

function DonutLegend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${color}`}></span>
      <span className="text-[10px] text-gray-500 font-medium">{label} ({value})</span>
    </div>
  );
}
