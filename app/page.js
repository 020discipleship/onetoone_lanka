"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../lib/firebase";

const weeks = Array.from({ length: 16 }, (_, index) => index + 1);
const STORAGE_KEYS = {
  users: "otod_users",
  currentUser: "otod_current_user",
  selectedMember: "otod_selected_member",
  selectedProgram: "otod_selected_program",
  selectedProgramSource: "otod_selected_program_source",
  resourceSource: "otod_resource_source",
  selectedResource: "otod_selected_resource",
  records: "otod_records",
  programRecords: "otod_program_records",
  menteeRecords: "otod_mentee_records",
  testimony: "otod_testimony",
  testimonies: "otod_testimonies",
  menteeNote: "otod_mentee_note",
  customPrograms: "otod_custom_programs",
  adminRequests: "otod_admin_requests",
  adminEmailNotifications: "otod_admin_email_notifications",
  resourceFiles: "otod_resource_files"
};
const ADMIN_EMAIL = "joylee83@gmail.com";
const TEST_USERS = [
  {
    id: "test-admin",
    name: "Admin User",
    email: "joylee83@gmail.com",
    password: "onetoonelanka",
    role: "Admin",
    contact: "Admin Group",
    birthDate: "1980-01-15",
    phone: "010-1000-0001",
    church: "Companion Community",
    approved: true
  }
];
const LEGACY_TEST_USER_EMAILS = ["mentor@test.com", "mentee@test.com"];
const mentorMentees = [];
const menteeHistory = [];
const discipleshipPrograms = [];
const DEFAULT_PROGRAM = { name: "No mentee assigned", mentor: "Not assigned", week: "Week 0", status: "Not Started", startDate: "Not set" };
const resources = [
  { title: "Discipleship Guide", meta: "16 Google Drive links / Admin Managed", fileName: "discipleship-guide.pdf", uploadedBy: "Admin User", uploadedAt: "2026-05-15" },
  { title: "Mentor Guide", meta: "Google Drive link / Admin Managed", fileName: "mentor-guide.docx", uploadedBy: "Admin User", uploadedAt: "2026-05-15" },
  { title: "Testimony Writing Guide", meta: "Google Drive link / Shared resource", fileName: "testimony-writing-guide.pdf", uploadedBy: "Admin User", uploadedAt: "2026-05-15" }
];
const guideItems = Array.from({ length: 16 }, (_, index) => `Week ${index + 1} Discipleship Guide`);
const discipleshipGuideFiles = Array.from({ length: 16 }, (_, index) => ({
  week: index + 1,
  title: `Week ${index + 1}`,
  fileName: `discipleship-guide-week-${index + 1}.pdf`,
  uploadedAt: "2026-05-15"
}));

function getProgramProgress(week) {
  const numericWeek = Number(String(week).replace(/\D/g, "")) || 0;
  return Math.min(100, Math.round((numericWeek / 16) * 100));
}

function hasSubmittedTestimony(menteeName) {
  return readMenteeTestimony(menteeName)?.status === "Submitted";
}

function getCompletedRecordWeek(records) {
  const completedRecords = records.filter((record) =>
    record.date || record.qt || record.verse || record.notes
  );
  return completedRecords.at(-1)?.week || 0;
}

function getResolvedProgramStatus(program) {
  const records = readProgramRecords(program);
  const completedWeek = getCompletedRecordWeek(records);
  if (completedWeek >= 16 && hasSubmittedTestimony(program?.name)) return "Completed";
  if (completedWeek > 0) return "In Progress";
  return program?.status === "Completed" ? "In Progress" : program?.status || "Not Started";
}

function getProgramProgressValue(program) {
  const records = readProgramRecords(program);
  const completedWeek = getCompletedRecordWeek(records);
  const numericWeek = completedWeek || Number(String(program?.week || "").replace(/\D/g, "")) || 0;
  if (numericWeek >= 16 && hasSubmittedTestimony(program?.name)) return 100;
  return Math.min(95, Math.round((numericWeek / 16) * 95));
}

function getProgramWeekLabel(program) {
  const records = readProgramRecords(program);
  const completedWeek = getCompletedRecordWeek(records);
  return completedWeek ? `Week ${completedWeek}` : program.week;
}

function getProgramStartDate(program, records) {
  const weekOneDate = records.find((record) => record.week === 1)?.date;
  return weekOneDate || program.startDate || "Not set";
}

function createEmptyRecords() {
  return weeks.map((week) => ({ week, date: "", qt: false, verse: false, notes: "" }));
}

function getProgramKey(program) {
  return `${program?.mentor || "unknown"}--${program?.name || "unknown"}`;
}

function findProgram(program) {
  const matchedProgram = [...readJson(STORAGE_KEYS.customPrograms, []), ...discipleshipPrograms].find((candidate) =>
    candidate.name === program?.name && candidate.mentor === program?.mentor
  );
  return matchedProgram ? { ...matchedProgram, ...program } : program;
}

function findMenteeProgram(user) {
  return [...readJson(STORAGE_KEYS.customPrograms, []), ...discipleshipPrograms].find((program) => program.name === user?.name && getResolvedProgramStatus(program) !== "Completed") || {
    name: user?.name || "Mentee",
    mentor: "Not assigned",
    week: "Week 0",
    status: "Not Started",
    startDate: "Not set"
  };
}

function getAllPrograms() {
  return [...discipleshipPrograms, ...readJson(STORAGE_KEYS.customPrograms, [])];
}

function writeAssignedProgram(mentee, mentorName) {
  const programs = readJson(STORAGE_KEYS.customPrograms, []);
  const nextProgram = {
    name: mentee.name,
    mentor: mentorName,
    week: "Week 0",
    status: "Not Started",
    startDate: "Not set"
  };
  writeJson(
    STORAGE_KEYS.customPrograms,
    [...programs.filter((program) => program.name !== mentee.name), nextProgram]
  );
  return nextProgram;
}

function getMemberProfile(name) {
  return readJson(STORAGE_KEYS.users, []).find((user) => user.name === name) || TEST_USERS.find((user) => user.name === name);
}

function readJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function normalizeUser(user) {
  return {
    ...user,
    id: user.id || user.uid,
    email: normalizeEmail(user.email || "")
  };
}

async function readFirestoreUsers() {
  if (!isFirebaseConfigured) return [];
  const snapshot = await getDocs(collection(db, "users"));
  return snapshot.docs
    .map((userDoc) => normalizeUser({ id: userDoc.id, ...userDoc.data() }))
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
}

async function readFirestoreUser(uid) {
  if (!isFirebaseConfigured) return null;
  const userDoc = await getDoc(doc(db, "users", uid));
  return userDoc.exists() ? normalizeUser({ id: userDoc.id, ...userDoc.data() }) : null;
}

async function writeFirestoreUser(user) {
  if (!isFirebaseConfigured) return normalizeUser(user);
  const nextUser = normalizeUser(user);
  await setDoc(doc(db, "users", nextUser.id), nextUser, { merge: true });
  return nextUser;
}

async function ensureAdminFirestoreUser(firebaseUser) {
  const adminUser = normalizeUser({
    ...TEST_USERS[0],
    id: firebaseUser.uid,
    email: ADMIN_EMAIL,
    approved: true,
    createdAt: new Date().toISOString()
  });
  await writeFirestoreUser(adminUser);
  return adminUser;
}

function getAuthMessage(error, fallback) {
  const code = error?.code || "";
  if (code.includes("invalid-api-key")) return "Firebase API key is invalid or missing in Vercel Environment Variables.";
  if (code.includes("unauthorized-domain")) return "This domain is not authorized in Firebase Authentication settings.";
  if (code.includes("operation-not-allowed")) return "Email/password login is not enabled in Firebase Authentication.";
  if (code.includes("network-request-failed")) return "Network connection failed. Please check your internet connection.";
  if (code.includes("email-already-in-use")) return "This email is already registered. Please log in or use another email.";
  if (code.includes("invalid-credential") || code.includes("wrong-password")) return "Email or password is not correct.";
  if (code.includes("user-not-found")) return "No matching account found. Try signing up first.";
  if (code.includes("weak-password")) return "Please enter a password with at least 6 characters.";
  return fallback;
}

function readProgramRecords(program) {
  const programDetails = findProgram(program);

  const menteeRecords = readJson(STORAGE_KEYS.menteeRecords, {});
  if (menteeRecords[programDetails.name]) return menteeRecords[programDetails.name];

  const programRecords = readJson(STORAGE_KEYS.programRecords, {});
  const programKey = getProgramKey(programDetails);
  const savedRecords = programRecords[programKey];
  if (savedRecords) return savedRecords;
  const matchedRecordKey = Object.keys(programRecords).find((key) => key.endsWith(`--${programDetails.name}`));
  if (matchedRecordKey) return programRecords[matchedRecordKey];
  if (programKey === "Kim--Yoon") return readJson(STORAGE_KEYS.records, createEmptyRecords());
  return createEmptyRecords();
}

function writeProgramRecords(program, records) {
  const completedWeek = getCompletedRecordWeek(records);
  const nextWeek = completedWeek ? `Week ${completedWeek}` : program.week;
  const nextStatus = completedWeek >= 16 && hasSubmittedTestimony(program.name)
    ? "Completed"
    : completedWeek > 0
      ? "In Progress"
      : program.status;
  const programRecords = readJson(STORAGE_KEYS.programRecords, {});
  const menteeRecords = readJson(STORAGE_KEYS.menteeRecords, {});
  const nextProgramRecords = {
    ...programRecords,
    [getProgramKey(program)]: records
  };
  writeJson(STORAGE_KEYS.programRecords, nextProgramRecords);
  writeJson(STORAGE_KEYS.menteeRecords, {
    ...menteeRecords,
    [program.name]: records
  });
  const customPrograms = readJson(STORAGE_KEYS.customPrograms, []);
  if (customPrograms.some((customProgram) => customProgram.name === program.name && customProgram.mentor === program.mentor)) {
    writeJson(STORAGE_KEYS.customPrograms, customPrograms.map((customProgram) =>
      customProgram.name === program.name && customProgram.mentor === program.mentor
        ? { ...customProgram, week: nextWeek, status: nextStatus }
        : customProgram
    ));
  }
  writeJson(STORAGE_KEYS.selectedProgram, { ...program, week: nextWeek, status: nextStatus });
}

function readMenteeTestimony(menteeName) {
  const testimonies = readJson(STORAGE_KEYS.testimonies, {});
  return testimonies[menteeName] || readJson(STORAGE_KEYS.testimony, null);
}

function writeMenteeTestimony(menteeName, testimony) {
  const testimonies = readJson(STORAGE_KEYS.testimonies, {});
  const nextTestimonies = {
    ...testimonies,
    [menteeName]: testimony
  };
  writeJson(STORAGE_KEYS.testimonies, nextTestimonies);
  writeJson(STORAGE_KEYS.testimony, testimony);
  const customPrograms = readJson(STORAGE_KEYS.customPrograms, []);
  writeJson(STORAGE_KEYS.customPrograms, customPrograms.map((program) => {
    if (program.name !== menteeName) return program;
    const completedWeek = getCompletedRecordWeek(readProgramRecords(program));
    const nextStatus = completedWeek >= 16 && testimony.status === "Submitted"
      ? "Completed"
      : completedWeek > 0
        ? "In Progress"
        : program.status;
    return { ...program, status: nextStatus };
  }));
}

function rolePath(role) {
  if (role === "Mentor") return "/mentor/dashboard";
  if (role === "Admin") return "/admin";
  return "/mentee/dashboard";
}

function ensureTestUsers() {
  const users = readJson(STORAGE_KEYS.users, []);
  const testUserEmails = new Set([
    ...TEST_USERS.map((user) => user.email),
    ...LEGACY_TEST_USER_EMAILS
  ]);
  const customUsers = users.filter((user) => !testUserEmails.has(user.email));

  writeJson(STORAGE_KEYS.users, [...TEST_USERS, ...customUsers]);
}

function selectProgram(program, source) {
  writeJson(STORAGE_KEYS.selectedProgram, program);
  writeJson(STORAGE_KEYS.selectedProgramSource, source);
}

function selectResourceSource(source) {
  writeJson(STORAGE_KEYS.resourceSource, source);
}

function selectResource(resource) {
  writeJson(STORAGE_KEYS.selectedResource, resource);
}

function getResourceFileKey(resource, week) {
  return week ? `${resource.title}::week-${week}` : resource.title;
}

function readResourceFiles() {
  return readJson(STORAGE_KEYS.resourceFiles, {});
}

async function readFirestoreResourceFiles() {
  if (!isFirebaseConfigured) return readResourceFiles();
  const snapshot = await getDocs(collection(db, "resourceFiles"));
  const files = {};
  snapshot.docs.forEach((fileDoc) => {
    files[fileDoc.id] = fileDoc.data();
  });
  writeJson(STORAGE_KEYS.resourceFiles, files);
  return files;
}

async function writeFirestoreResourceLink(resource, link, week, user) {
  if (!link?.name || !link?.downloadUrl) throw new Error("Missing Google Drive link.");
  const nextFile = {
    name: link.name,
    type: "Google Drive",
    size: 0,
    downloadUrl: link.downloadUrl,
    uploadedAt: new Date().toISOString().slice(0, 10),
    uploadedBy: user?.name || "Admin User"
  };
  if (isFirebaseConfigured) {
    await setDoc(doc(db, "resourceFiles", getResourceFileKey(resource, week)), nextFile);
  }
  const files = readResourceFiles();
  writeJson(STORAGE_KEYS.resourceFiles, {
    ...files,
    [getResourceFileKey(resource, week)]: nextFile
  });
  return nextFile;
}

function writeResourceFile(resource, file, dataUrl, week, user) {
  const files = readResourceFiles();
  writeJson(STORAGE_KEYS.resourceFiles, {
    ...files,
    [getResourceFileKey(resource, week)]: {
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl,
      uploadedAt: new Date().toISOString().slice(0, 10),
      uploadedBy: user?.name || "Admin User"
    }
  });
}

function deleteResourceFile(resource, week) {
  const files = readResourceFiles();
  const nextFiles = { ...files };
  delete nextFiles[getResourceFileKey(resource, week)];
  writeJson(STORAGE_KEYS.resourceFiles, nextFiles);
}

async function deleteFirestoreResourceFile(resource, week, file) {
  if (isFirebaseConfigured) await deleteDoc(doc(db, "resourceFiles", getResourceFileKey(resource, week)));
  deleteResourceFile(resource, week);
}

function downloadResourceFile(file) {
  if (file.downloadUrl) {
    window.open(file.downloadUrl, "_blank", "noopener,noreferrer");
    return;
  }

  const [header, base64Data] = file.dataUrl.split(",");
  const mimeType = header.match(/data:(.*);base64/)?.[1] || file.type || "application/octet-stream";
  const binary = atob(base64Data);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function writeAdminRequest(request) {
  const requestId = request.id || crypto.randomUUID();
  const createdAt = request.createdAt || new Date().toISOString();
  const nextRequest = {
    ...request,
    id: requestId,
    createdAt,
    status: request.status || "Open",
    notificationStatus: "Email queued"
  };
  const requests = readJson(STORAGE_KEYS.adminRequests, []);
  const notifications = readJson(STORAGE_KEYS.adminEmailNotifications, []);
  writeJson(STORAGE_KEYS.adminRequests, [nextRequest, ...requests]);
  writeJson(STORAGE_KEYS.adminEmailNotifications, [
    {
      id: crypto.randomUUID(),
      requestId,
      to: ADMIN_EMAIL,
      subject: `[Q&A Request] ${nextRequest.title}`,
      body: `${nextRequest.sender} (${nextRequest.role}) submitted a request: ${nextRequest.detail}`,
      status: "Queued",
      createdAt
    },
    ...notifications
  ]);
}

function getDiscipleshipHistory(memberName) {
  return getAllPrograms().filter((program) =>
    program.name === memberName || program.mentor === memberName
  );
}

function formatDateLabel(value) {
  if (!value) return "Select date";
  if (value.includes("/")) return value;

  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

function parseDisplayDate(value) {
  const fallback = { month: "01", day: "01", year: "2026" };
  if (!value) return fallback;

  if (value.includes("/")) {
    const [month, day, year] = value.split("/");
    return {
      month: month?.padStart(2, "0") || fallback.month,
      day: day?.padStart(2, "0") || fallback.day,
      year: year || fallback.year
    };
  }

  const [year, month, day] = value.split("-");
  return {
    month: month || fallback.month,
    day: day || fallback.day,
    year: year || fallback.year
  };
}

function DatePickerCell({ record, canEditRecords, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = parseDisplayDate(record.date);
  const years = Array.from({ length: 9 }, (_, index) => String(2022 + index));
  const months = [
    ["01", "Jan"],
    ["02", "Feb"],
    ["03", "Mar"],
    ["04", "Apr"],
    ["05", "May"],
    ["06", "Jun"],
    ["07", "Jul"],
    ["08", "Aug"],
    ["09", "Sep"],
    ["10", "Oct"],
    ["11", "Nov"],
    ["12", "Dec"]
  ];
  const days = Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0"));

  function updateDate(part, value) {
    const nextDate = { ...selected, [part]: value };
    onChange(`${nextDate.month}/${nextDate.day}/${nextDate.year}`);
  }

  if (!canEditRecords) {
    return <span className="dateLabel">{formatDateLabel(record.date)}</span>;
  }

  return (
    <div className="datePicker">
      <button className="datePickButton" type="button" onClick={() => setOpen((current) => !current)}>
        <span>{record.date || "MM/DD/YYYY"}</span>
        <strong>Pick</strong>
      </button>
      {open ? (
        <div className="datePickerPanel">
          <select aria-label={`Week ${record.week} month`} value={selected.month} onChange={(event) => updateDate("month", event.target.value)}>
            {months.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label={`Week ${record.week} day`} value={selected.day} onChange={(event) => updateDate("day", event.target.value)}>
            {days.map((day) => <option key={day} value={day}>{day}</option>)}
          </select>
          <select aria-label={`Week ${record.week} year`} value={selected.year} onChange={(event) => updateDate("year", event.target.value)}>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
      ) : null}
    </div>
  );
}

function BirthDatePicker({ value, onChange }) {
  const selected = parseDisplayDate(value);
  const years = Array.from({ length: 87 }, (_, index) => String(2026 - index));
  const months = [
    ["01", "Jan"],
    ["02", "Feb"],
    ["03", "Mar"],
    ["04", "Apr"],
    ["05", "May"],
    ["06", "Jun"],
    ["07", "Jul"],
    ["08", "Aug"],
    ["09", "Sep"],
    ["10", "Oct"],
    ["11", "Nov"],
    ["12", "Dec"]
  ];
  const days = Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0"));

  function updateDate(part, nextValue) {
    const nextDate = { ...selected, [part]: nextValue };
    onChange(`${nextDate.month}/${nextDate.day}/${nextDate.year}`);
  }

  return (
    <div className="birthDatePicker">
      <select aria-label="Birth month" value={selected.month} onChange={(event) => updateDate("month", event.target.value)}>
        {months.map(([monthValue, label]) => <option key={monthValue} value={monthValue}>{label}</option>)}
      </select>
      <select aria-label="Birth day" value={selected.day} onChange={(event) => updateDate("day", event.target.value)}>
        {days.map((day) => <option key={day} value={day}>{day}</option>)}
      </select>
      <select aria-label="Birth year" value={selected.year} onChange={(event) => updateDate("year", event.target.value)}>
        {years.map((year) => <option key={year} value={year}>{year}</option>)}
      </select>
    </div>
  );
}

function AdminTabBar({ active = "dashboard" }) {
  const requestCount = readJson(STORAGE_KEYS.adminRequests, []).filter((request) => !request.readAt).length;

  return (
    <div className="tabbar adminTabbar">
      <a className={active === "home" ? "active" : ""} href="/">Home</a>
      <div className="tabItem">
        <a className={active === "dashboard" ? "active" : ""} href="/admin">Dashboard</a>
        <div className="tabSubmenu dashboardMenu">
          <a href="/admin/members">Member Management</a>
          <a href="/admin/monitoring">Disciple Monitoring</a>
          <a href="/admin/reports">Statics and Reports</a>
        </div>
      </div>
      <ResourceTab active={active === "resources"} source="admin" />
      <a className={`tabWithBadge ${active === "qna" ? "active" : ""}`} href="/admin/qna">Q & A{requestCount ? <sup className="tabBadge" aria-label={`${requestCount} Q & A requests`}>{requestCount}</sup> : null}</a>
    </div>
  );
}

function ResourceTab({ active = false, source = "mentor" }) {
  return (
    <div className="tabItem">
      <a className={active ? "active" : ""} href="/mentor/resources" onClick={() => selectResourceSource(source)}>Resources</a>
      <div className="tabSubmenu resourceMenu">
        {resources.map((resource) => (
          <a href="/mentor/resources/file" key={resource.title} onClick={() => { selectResourceSource(source); selectResource(resource); }}>{resource.title}</a>
        ))}
      </div>
    </div>
  );
}

function MentorDashboardTab({ active = false }) {
  return (
    <div className="tabItem">
      <a className={active ? "active" : ""} href="/mentor/dashboard">Dashboard</a>
      <div className="tabSubmenu mentorDashboardMenu">
        <a href="/mentor/mentees">Assigned Mentee List</a>
        <a href="/mentor/history">Mentee Discipleship History</a>
      </div>
    </div>
  );
}

function MentorTabBar({ active = "dashboard" }) {
  return (
    <div className="tabbar mentorTabbar adminTabbar">
      <a className={active === "home" ? "active" : ""} href="/">Home</a>
      <MentorDashboardTab active={active === "dashboard"} />
      <ResourceTab active={active === "resources"} source="mentor" />
      <a className={active === "qna" ? "active" : ""} href="/mentor/qna">Q & A</a>
      <a className={active === "profile" ? "active" : ""} href="/profile">Profile</a>
    </div>
  );
}

function MenteeTabBar({ active = "dashboard" }) {
  return (
    <div className="tabbar mentorTabbar adminTabbar">
      <a className={active === "home" ? "active" : ""} href="/">Home</a>
      <a className={active === "dashboard" ? "active" : ""} href="/mentee/dashboard">Dashboard</a>
      <ResourceTab active={active === "resources"} source="mentee" />
      <a className={active === "qna" ? "active" : ""} href="/mentee/qna">Q & A</a>
      <a className={active === "profile" ? "active" : ""} href="/profile">Profile</a>
    </div>
  );
}

function Phone({ children, id }) {
  const router = useRouter();

  useEffect(() => {
    const publicPaths = new Set(["/", "/about", "/login", "/signup", "/find-password"]);

    function redirectIfSignedOut() {
      const isPublicPath = publicPaths.has(window.location.pathname);
      const currentUser = readJson(STORAGE_KEYS.currentUser, null);
      if (!isPublicPath && !currentUser) router.replace("/");
    }

    redirectIfSignedOut();
    window.addEventListener("pageshow", redirectIfSignedOut);

    return () => {
      window.removeEventListener("pageshow", redirectIfSignedOut);
    };
  }, [router]);

  return (
    <article className="phone" id={id}>
      <div className="screen">{children}</div>
    </article>
  );
}

function AppBar({ title, left, right, home = false }) {
  return (
    <div className={`appbar ${home ? "homeAppbar" : ""}`}>
      {left}
      <div className="brand">{title}</div>
      {right}
    </div>
  );
}

function IconButton({ children, href = "/" }) {
  const label = children === "⌂" ? "Home" : children === "‹" ? "Back" : undefined;

  return (
    <Link className="iconButton" href={href} aria-label={label} title={label}>
      {children}
    </Link>
  );
}

export function Section({ id, title, note, children }) {
  return (
    <section className="section" id={id}>
      <div className="sectionHeader">
        <h2>{title}</h2>
        <p>{note}</p>
      </div>
      <div className="board">{children}</div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

export function ScreenPage({ title, note, children }) {
  return (
    <main className="page">
      <Section id="screen" title={title} note={note}>
        {children}
      </Section>
    </main>
  );
}

export function HomeScreen() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(readJson(STORAGE_KEYS.currentUser, null));
  }, []);

  function logOut() {
    window.localStorage.removeItem(STORAGE_KEYS.currentUser);
    if (auth) signOut(auth).catch(() => {});
    setUser(null);
  }

  return (
    <Phone>
      <div className="appbar homeAppbar">
        <div className="brand homeBrand"><span>One to One</span><span>Discipleship</span></div>
        <div className="homeActions">
          {user ? (
            <>
              <a className="button" href={rolePath(user.role)}>Dashboard</a>
              <button className="button buttonSecondary" type="button" onClick={logOut}>Log Out</button>
            </>
          ) : (
            <>
              <a className="button" href="/login">Log In</a>
              <a className="button buttonSecondary" href="/signup">Sign Up</a>
            </>
          )}
        </div>
      </div>
      <div className="content homeContent">
        <section className="homeHero" aria-label="One-on-One Discipleship introduction">
          <h1 className="homeHeroTitle"><span>One to One</span><span>Discipleship</span></h1>
          <div className="homeHeroLines">
            <p>Growing in Christ.</p>
            <p>Walking together.</p>
            <p>Multiplying disciples.</p>
          </div>
          <div className="homeVerse">
            <p>“Go and make disciples of all nations.”</p>
            <span>— Matthew 28:19</span>
          </div>
          <a className="homeAboutButton" href="/about">ABOUT</a>
        </section>
      </div>
    </Phone>
  );
}

export function AboutScreen() {
  const pathwaySteps = [
    {
      title: "Companion Course",
      description: "Begin the journey with a mentor and build a foundation of trust, faith, and weekly discipleship."
    },
    {
      title: "16-Week Journey",
      description: "Grow step by step through Scripture, prayer, reflection, and practical spiritual formation."
    },
    {
      title: "Completion",
      description: "Celebrate the completion of the journey and reflect on growth, testimony, and next steps."
    },
    {
      title: "Mentor Training",
      description: "Prepare to guide others through deeper training in discipleship and spiritual leadership."
    },
    {
      title: "New Companion Connection",
      description: "Begin walking with a new companion and continue the cycle of discipleship."
    }
  ];

  return (
    <Phone id="about">
      <AppBar title="ABOUT" left={<IconButton href="/">‹</IconButton>} right={<IconButton href="/">⌂</IconButton>} />
      <div className="content aboutContent">
        <section className="aboutIntro">
          <span className="aboutLabel">ONE TO ONE DISCIPLESHIP</span>
          <h1>Walking Together Toward Christ</h1>
          <p>
            One-to-One Discipleship is a guided journey of spiritual growth through Scripture,
            prayer, reflection, and faithful companionship.
          </p>
        </section>

        <section className="aboutSection" aria-labelledby="about-definition">
          <div className="aboutDefinition">
            <h2 id="about-definition"><span>What is</span><strong>One-to-One Discipleship?</strong></h2>
            <div className="aboutDefinitionLines">
              <p>A companion-based journey.</p>
              <p>Growing in Christ through Scripture and prayer.</p>
              <p>Multiplying disciples who walk with others.</p>
            </div>
          </div>
        </section>

        <section className="aboutSection" aria-labelledby="about-pathway">
          <h2 id="about-pathway" className="aboutSectionTitle">Discipleship Pathway</h2>
          <div className="pathwayDiagram">
            {pathwaySteps.map((step, index) => (
              <article className="pathwayStep" key={step.title}>
                <span className="pathwayNumber">{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <a className="backToTopButton" href="#about">Back to Top</a>
      </div>
    </Phone>
  );
}

export function SignUpScreen() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "Mentee",
    birthDate: "",
    phone: "",
    contact: ""
  });
  const [message, setMessage] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    ensureTestUsers();
  }, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.name || !form.email || !form.password) {
      setMessage("Please fill in name, email, and password.");
      setIsSubmitted(false);
      return;
    }

    try {
      if (!isFirebaseConfigured) {
        setMessage("Firebase is not configured yet. Please add Firebase environment variables in Vercel.");
        setIsSubmitted(false);
        return;
      }
      setMessage("Creating account...");
      const createdUser = await createUserWithEmailAndPassword(auth, normalizeEmail(form.email), form.password);
      const nextUser = {
        id: createdUser.user.uid,
        name: form.name,
        email: normalizeEmail(form.email),
        role: form.role,
        birthDate: form.birthDate,
        phone: form.phone,
        contact: form.contact,
        church: form.contact,
        approved: false,
        createdAt: new Date().toISOString()
      };
      await writeFirestoreUser(nextUser);
      await setDoc(doc(db, "adminRequests", crypto.randomUUID()), {
        sender: nextUser.name,
        role: nextUser.role,
        title: `New ${nextUser.role} sign-up request`,
        status: "Open",
        type: "signup",
        memberId: nextUser.id,
        memberEmail: nextUser.email,
        detail: `New sign-up request from ${nextUser.name} (${nextUser.email}). Phone: ${nextUser.phone || "-"}, Community: ${nextUser.contact || "-"}.`,
        createdAt: new Date().toISOString(),
        readAt: ""
      });
      const users = readJson(STORAGE_KEYS.users, []);
      writeJson(STORAGE_KEYS.users, [...users.filter((user) => user.id !== nextUser.id), nextUser]);
      await signOut(auth);
      setMessage("Account created. Please wait for Admin approval before logging in.");
      setIsSubmitted(true);
    } catch (error) {
      setMessage(getAuthMessage(error, "Sign-up could not be completed. Please try again."));
      setIsSubmitted(false);
    }
  }

  return (
    <Phone id="signup">
      <AppBar title="Sign Up" left={<IconButton href="/">‹</IconButton>} right={<IconButton href="/">⌂</IconButton>} />
      <form className="content" onSubmit={handleSubmit}>
        <div className="card cardFilled"><strong>Enter Basic Information</strong><p className="text">After sign-up, an admin can verify the requested role.</p></div>
        <Field label="Name"><input className="input" value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="Alex Kim" /></Field>
        <Field label="Birth Date"><BirthDatePicker value={form.birthDate} onChange={(value) => updateField("birthDate", value)} /></Field>
        <Field label="Phone"><input className="input" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} placeholder="010-0000-0000" type="tel" /></Field>
        <Field label="Email"><input className="input" value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="name@example.com" type="email" /></Field>
        <Field label="Password"><input className="input" value={form.password} onChange={(event) => updateField("password", event.target.value)} placeholder="Enter at least 8 characters" type="password" /></Field>
        <Field label="Requested Role">
          <div className="grid2">
            <button className={`choiceButton ${form.role === "Mentee" ? "selected" : ""}`} type="button" onClick={() => updateField("role", "Mentee")}>Mentee</button>
            <button className={`choiceButton ${form.role === "Mentor" ? "selected" : ""}`} type="button" onClick={() => updateField("role", "Mentor")}>Mentor</button>
          </div>
        </Field>
        <Field label="Group / Contact"><input className="input" value={form.contact} onChange={(event) => updateField("contact", event.target.value)} placeholder="Optional information" /></Field>
        {message ? <p className="message">{message}</p> : null}
        <div className="bottomActions">{isSubmitted ? <a className="button" href="/">Home</a> : <button className="button" type="submit">Complete Sign Up</button>}</div>
      </form>
    </Phone>
  );
}

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    ensureTestUsers();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      if (!isFirebaseConfigured) {
        setMessage("Firebase is not configured yet. Please add Firebase environment variables in Vercel.");
        return;
      }
      setMessage("Logging in...");
      const credential = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
      let user = await readFirestoreUser(credential.user.uid);
      if (!user && normalizeEmail(email) === ADMIN_EMAIL) {
        user = await ensureAdminFirestoreUser(credential.user);
      }
      if (!user) {
        await signOut(auth);
        setMessage("No member profile was found. Please contact Admin.");
        return;
      }
      if (!user.approved) {
        await signOut(auth);
        setMessage("Your account is pending Admin approval.");
        return;
      }
      writeJson(STORAGE_KEYS.currentUser, user);
      router.push(rolePath(user.role));
    } catch (error) {
      const shouldPrepareAdmin =
        ["auth/user-not-found", "auth/invalid-credential"].includes(error?.code) &&
        normalizeEmail(email) === ADMIN_EMAIL &&
        password === "onetoonelanka";

      if (shouldPrepareAdmin) {
        try {
          const credential = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, password);
          const adminUser = await ensureAdminFirestoreUser(credential.user);
          writeJson(STORAGE_KEYS.currentUser, adminUser);
          router.push(rolePath(adminUser.role));
          return;
        } catch (adminError) {
          setMessage(getAuthMessage(adminError, "Admin account could not be prepared. Please try again."));
          return;
        }
      }
      setMessage(getAuthMessage(error, "Login could not be completed. Please try again."));
    }
  }

  return (
    <Phone id="login">
      <AppBar title="Log In" left={<IconButton href="/">‹</IconButton>} right={<IconButton href="/">⌂</IconButton>} />
      <form className="content" onSubmit={handleSubmit}>
        <Field label="Email"><input className="input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter email" type="email" /></Field>
        <Field label="Password"><input className="input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" type="password" /></Field>
        {message ? <p className="message">{message}</p> : null}
        <button className="button" type="submit">Log In</button>
        <div className="grid2"><a className="button buttonSecondary" href="/signup">Sign Up</a><a className="button buttonSecondary" href="/find-password">Find Password</a></div>
      </form>
    </Phone>
  );
}

export function FindPasswordScreen() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      if (!isFirebaseConfigured) {
        setMessage("Firebase is not configured yet. Please add Firebase environment variables in Vercel.");
        return;
      }
      await sendPasswordResetEmail(auth, normalizeEmail(email));
      setMessage("Password reset email sent. Check your inbox.");
    } catch (error) {
      setMessage(getAuthMessage(error, "Password reset email could not be sent. Please check the email address."));
    }
  }

  return (
    <Phone id="find-password">
      <AppBar title="Find Password" left={<IconButton href="/login">‹</IconButton>} right={<IconButton href="/">⌂</IconButton>} />
      <form className="content" onSubmit={handleSubmit}>
        <div className="card cardFilled"><strong>Reset Your Password</strong><p className="text">Enter your registered email to receive a password reset link.</p></div>
        <Field label="Email"><input className="input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter registered email" type="email" /></Field>
        {message ? <p className="message">{message}</p> : null}
        <div className="bottomActions"><button className="button" type="submit">Send Reset Link</button><a className="button buttonSecondary" href="/login">Back to Log In</a></div>
        <div className="card cardSoft"><div className="label">After Sending</div><p className="text">The user checks email, opens the reset link, and creates a new password.</p></div>
      </form>
    </Phone>
  );
}

export function MenteeDashboard() {
  const [user, setUser] = useState(null);
  const [program, setProgram] = useState(DEFAULT_PROGRAM);
  const [records, setRecords] = useState(() => createEmptyRecords());
  const [testimony, setTestimony] = useState(null);

  useEffect(() => {
    async function loadDashboard() {
      const currentUser = readJson(STORAGE_KEYS.currentUser, null);
      let users = readJson(STORAGE_KEYS.users, []);

      try {
        const firestoreUsers = await readFirestoreUsers();
        if (firestoreUsers.length) {
          users = firestoreUsers;
          writeJson(STORAGE_KEYS.users, firestoreUsers);
        }
      } catch {
        // Use saved browser data when Firestore is unavailable.
      }

      const freshUser = users.find((candidate) => candidate.id === currentUser?.id || candidate.email === currentUser?.email);
      const nextUser = freshUser || currentUser;
      const currentProgram = findMenteeProgram(nextUser);
      setUser(nextUser);
      setProgram(currentProgram);
      setRecords(readProgramRecords(currentProgram));
      setTestimony(readMenteeTestimony(nextUser?.name));
    }

    loadDashboard();
  }, []);

  const currentWeekNumber = getCompletedRecordWeek(records);
  const currentWeek = currentWeekNumber ? `Week ${currentWeekNumber}` : program.week;
  const recordsDone = records.filter((record) => record.date || record.qt || record.verse || record.notes).length;
  const progressValue = getProgramProgressValue(program);
  const displayStatus = getResolvedProgramStatus(program);
  const testimonyComplete = testimony?.status === "Submitted";

  return (
    <Phone id="mentee-dashboard">
      <AppBar title="My Dashboard" right={<IconButton href="/">⌂</IconButton>} />
      <div className="content">
        <div className="card cardFilled"><div className="row"><div><div className="label">Welcome</div><strong>{user?.name || program.name}</strong><p className="text">Assigned Mentor: {program.mentor}</p></div><span className="pill">{displayStatus}</span></div></div>
        <div className="grid2"><div className="metric"><span className="label">Current Week</span><h3>{currentWeek}</h3></div><div className="metric"><span className="label">Records Done</span><h3>{recordsDone}/16</h3></div></div>
        <div className="card"><div className="row"><strong>Discipleship Progress</strong><span className="status">{progressValue}%</span></div><div className="progress"><span style={{ width: `${progressValue}%` }} /></div></div>
        <div className="list"><a className="listItem" href="/mentee/records"><strong>Weekly Record Details</strong><span className="status">Latest: {currentWeek}</span></a></div>
        <div className="card">
          <strong>Mentor Training Course</strong>
          <p className="text">Training Leader: {user?.mentorTrainingLeader || "-"}</p>
          <p className="text">Start Date: {user?.mentorTrainingStartDate || "-"}</p>
          <p className="text">Completion Date: {user?.mentorTrainingCompletionDate || "-"}</p>
        </div>
        <div className="list"><a className="listItem" href="/mentee/testimony"><strong>Testimony</strong><span className={`status ${testimonyComplete ? "ok" : "warn"}`}>{testimonyComplete ? "Completed" : "Write and upload testimony"}</span></a></div>
      </div>
      <MenteeTabBar active="dashboard" />
    </Phone>
  );
}

export function MenteeWeekScreen() {
  const [program, setProgram] = useState(DEFAULT_PROGRAM);
  const [records, setRecords] = useState(() => createEmptyRecords());

  useEffect(() => {
    const currentUser = readJson(STORAGE_KEYS.currentUser, null);
    const currentProgram = findMenteeProgram(currentUser);
    setProgram(currentProgram);
    setRecords(readProgramRecords(currentProgram));
  }, []);

  const currentWeekNumber = getCompletedRecordWeek(records);
  const currentWeek = currentWeekNumber ? `Week ${currentWeekNumber}` : program.week;
  const currentRecord = records.find((record) => record.week === currentWeekNumber) || records[0];

  return (
    <Phone id="mentee-week">
      <AppBar title="Weekly Record Details" left={<IconButton href="/mentee/dashboard">‹</IconButton>} right={<IconButton href="/">⌂</IconButton>} />
      <div className="content">
        <div className="card cardFilled"><strong>My Progress</strong></div>
        <div className="timeline">
          {records.slice(0, Math.max(1, currentWeekNumber || 1)).map((record) => {
            const isComplete = record.date || record.qt || record.verse || record.notes;
            return (
              <div className="listItem" key={record.week}><strong>Week {record.week}</strong><span className={`status ${isComplete ? "ok" : "warn"}`}>{isComplete ? "Mentor Record Saved" : "Needs Writing"}</span></div>
            );
          })}
        </div>
        <div className="card">
          <strong>Mentor Record Summary</strong>
          <p className="text">Date: {currentRecord?.date || "Not set"}</p>
          <p className="text">QT: {currentRecord?.qt ? "Done" : "Not checked"} / Memorizing Verse: {currentRecord?.verse ? "Done" : "Not checked"}</p>
          <p className="text">Notes: {currentRecord?.notes || "No notes yet"}</p>
        </div>
      </div>
      <MenteeTabBar active="dashboard" />
    </Phone>
  );
}

export function TestimonyScreen() {
  const [title, setTitle] = useState("My Growth and Gratitude");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
  const [testimonyStatus, setTestimonyStatus] = useState("Draft");

  useEffect(() => {
    const currentUser = readJson(STORAGE_KEYS.currentUser, null);
    setUser(currentUser);
    const saved = readMenteeTestimony(currentUser?.name);
    if (saved) {
      setTitle(saved.title || "");
      setBody(saved.body || "");
      setTestimonyStatus(saved.status || "Draft");
    }
  }, []);

  function saveTestimony(status = "Draft") {
    const nextTestimony = {
      title,
      body,
      status,
      menteeName: user?.name || "Yoon",
      savedAt: new Date().toISOString()
    };
    writeMenteeTestimony(user?.name || "Yoon", nextTestimony);
    setTestimonyStatus(status);
    setMessage(status === "Submitted" ? "Testimony uploaded for admin review." : "Testimony draft saved.");
  }

  return (
    <Phone id="mentee-testimony">
      <AppBar title="Testimony Management" left={<IconButton href="/mentee/dashboard">‹</IconButton>} right={<IconButton href="/">⌂</IconButton>} />
      <div className="content">
        <div className="card cardFilled"><div className="row"><strong>Testimony</strong><span className="pill">{testimonyStatus === "Submitted" ? "Completed" : "Draft"}</span></div></div>
        <Field label="Testimony Title"><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="Body"><textarea className="textarea" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write the testimony content." /></Field>
        {message ? <p className="message">{message}</p> : null}
        <div className="grid2"><button className="button buttonSecondary" type="button" onClick={() => saveTestimony("Draft")}>Save Draft</button><button className="button buttonSecondary" type="button" onClick={() => saveTestimony("Submitted")}>Testimony Upload</button></div>
        <div className="list"><div className="listItem"><strong>Recent Change</strong><span className="status">{message ? "Saved just now" : "No saved change yet"}</span></div></div>
      </div>
      <MenteeTabBar />
    </Phone>
  );
}

export function MentorDashboard() {
  const [currentWeek, setCurrentWeek] = useState(DEFAULT_PROGRAM.week);
  const [assignedMentees, setAssignedMentees] = useState(mentorMentees.length);
  const [completedMentees, setCompletedMentees] = useState(0);
  const [progressValue, setProgressValue] = useState(0);

  useEffect(() => {
    const currentUser = readJson(STORAGE_KEYS.currentUser, null);
    const mentorName = currentUser?.role === "Mentor" ? currentUser.name : "Kim";
    const mentorPrograms = getAllPrograms().filter((program) => program.mentor === mentorName);
    const activePrograms = mentorPrograms.filter((program) => getResolvedProgramStatus(program) !== "Completed");
    const completedPrograms = mentorPrograms.filter((program) => getResolvedProgramStatus(program) === "Completed");
    setAssignedMentees(activePrograms.length);
    setCompletedMentees(completedPrograms.length);
    const averageProgress = mentorPrograms.length
      ? Math.round(mentorPrograms.reduce((sum, program) => sum + getProgramProgressValue(program), 0) / mentorPrograms.length)
      : 0;
    const furthestWeek = mentorPrograms.reduce((highestWeek, program) => {
      const weekNumber = Number(String(getProgramWeekLabel(program)).replace(/\D/g, "")) || 0;
      return Math.max(highestWeek, weekNumber);
    }, 0);
    setCurrentWeek(furthestWeek ? `Week ${furthestWeek}` : DEFAULT_PROGRAM.week);
    setProgressValue(averageProgress);
  }, []);

  return (
    <Phone>
      <AppBar title="My Dashboard" right={<IconButton href="/">⌂</IconButton>} />
      <div className="content">
        <div className="grid2 mentorStats"><div className="metric"><span className="label">Assigned Mentees</span><h3>{assignedMentees}</h3></div><div className="metric"><span className="label">Completed Mentees</span><h3>{completedMentees}</h3></div></div>
        <div className="card"><div className="row"><strong>Discipleship Progress</strong><span className="status">{currentWeek} / {progressValue}%</span></div><div className="progress"><span style={{ width: `${progressValue}%` }} /></div></div>
        <div className="list"><a className="listItem" href="/mentor/mentees"><strong>Assigned Mentee List</strong><span className="status">Review records and give feedback</span></a><a className="listItem" href="/mentor/history"><strong>Mentee Discipleship History</strong><span className="status">Progress history by person</span></a></div>
      </div>
      <MentorTabBar active="dashboard" />
    </Phone>
  );
}

export function MentorQna() {
  const [user, setUser] = useState(null);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState("");

  function loadRequests(currentUser) {
    const storedRequests = readJson(STORAGE_KEYS.adminRequests, []);
    setRequests(storedRequests.filter((request) =>
      request.senderEmail === currentUser?.email || request.sender === currentUser?.name
    ));
  }

  useEffect(() => {
    const currentUser = readJson(STORAGE_KEYS.currentUser, null);
    setUser(currentUser);
    loadRequests(currentUser);
  }, []);

  function submitQuestion(event) {
    event.preventDefault();
    if (!title.trim() || !detail.trim()) {
      setMessage("Please enter a title and question.");
      return;
    }

    const currentUser = user || readJson(STORAGE_KEYS.currentUser, null);
    writeAdminRequest({
      sender: currentUser?.name || "Mentor",
      senderEmail: currentUser?.email || "",
      role: "Mentor",
      title: title.trim(),
      detail: detail.trim(),
      status: "Open",
      type: "qna"
    });
    setTitle("");
    setDetail("");
    setMessage("Question sent to Admin.");
    loadRequests(currentUser);
  }

  return (
    <Phone>
      <AppBar title="Q & A" left={<IconButton href="/mentor/dashboard">‹</IconButton>} right={<IconButton href="/">⌂</IconButton>} />
      <form className="content" onSubmit={submitQuestion}>
        <div className="card cardFilled"><strong>Ask Admin</strong><p className="text">Send a question or request to the admin team.</p></div>
        <Field label="Title"><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Question title" /></Field>
        <Field label="Question"><textarea className="textarea" value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Write your question." /></Field>
        <button className="button" type="submit">Send Question</button>
        {message ? <p className="message">{message}</p> : null}
        <div className="list">
          {requests.map((request) => (
            <div className="listItem" key={request.id}>
              <div className="row"><strong>{request.title}</strong><span className="pill">{request.status}</span></div>
              <p className="text">{request.detail}</p>
              {request.answer ? <p className="message">Admin Answer: {request.answer}</p> : <span className="status">Waiting for admin answer</span>}
            </div>
          ))}
        </div>
      </form>
      <MentorTabBar active="qna" />
    </Phone>
  );
}

export function MenteeQna() {
  const [user, setUser] = useState(null);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState("");

  function loadRequests(currentUser) {
    const storedRequests = readJson(STORAGE_KEYS.adminRequests, []);
    setRequests(storedRequests.filter((request) =>
      request.senderEmail === currentUser?.email || request.sender === currentUser?.name
    ));
  }

  useEffect(() => {
    const currentUser = readJson(STORAGE_KEYS.currentUser, null);
    setUser(currentUser);
    loadRequests(currentUser);
  }, []);

  function submitQuestion(event) {
    event.preventDefault();
    if (!title.trim() || !detail.trim()) {
      setMessage("Please enter a title and question.");
      return;
    }

    const currentUser = user || readJson(STORAGE_KEYS.currentUser, null);
    writeAdminRequest({
      sender: currentUser?.name || "Mentee",
      senderEmail: currentUser?.email || "",
      role: "Mentee",
      title: title.trim(),
      detail: detail.trim(),
      status: "Open",
      type: "qna"
    });
    setTitle("");
    setDetail("");
    setMessage("Question sent to Admin.");
    loadRequests(currentUser);
  }

  return (
    <Phone>
      <AppBar title="Q & A" left={<IconButton href="/mentee/dashboard">‹</IconButton>} right={<IconButton href="/">⌂</IconButton>} />
      <form className="content" onSubmit={submitQuestion}>
        <div className="card cardFilled"><strong>Ask Admin</strong><p className="text">Send a question or request to the admin team.</p></div>
        <Field label="Title"><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Question title" /></Field>
        <Field label="Question"><textarea className="textarea" value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Write your question." /></Field>
        <button className="button" type="submit">Send Question</button>
        {message ? <p className="message">{message}</p> : null}
        <div className="list">
          {requests.map((request) => (
            <div className="listItem" key={request.id}>
              <div className="row"><strong>{request.title}</strong><span className="pill">{request.status}</span></div>
              <p className="text">{request.detail}</p>
              {request.answer ? <p className="message">Admin Answer: {request.answer}</p> : <span className="status">Waiting for admin answer</span>}
            </div>
          ))}
        </div>
      </form>
      <MenteeTabBar active="qna" />
    </Phone>
  );
}

export function MentorMenteeListScreen({ history = false }) {
  const [rows, setRows] = useState(history ? menteeHistory : mentorMentees);

  useEffect(() => {
    const currentUser = readJson(STORAGE_KEYS.currentUser, null);
    const mentorName = currentUser?.role === "Mentor" ? currentUser.name : "Kim";
    if (history) {
      setRows(getAllPrograms().filter((program) => program.mentor === mentorName && getResolvedProgramStatus(program) === "Completed").map((row) => ({
        ...row,
        week: getProgramWeekLabel(row)
      })));
      return;
    }

    setRows(getAllPrograms().filter((program) => program.mentor === mentorName && getResolvedProgramStatus(program) !== "Completed").map((row) => ({
      ...row,
      week: getProgramWeekLabel(row)
    })));
  }, [history]);

  return (
    <Phone>
      <AppBar title={history ? "Discipleship History" : "Assigned Mentee List"} left={<IconButton href="/mentor/dashboard">‹</IconButton>} right={<IconButton href="/">⌂</IconButton>} />
      <div className="content">
        <div className="card cardFilled">
          <strong>{history ? "Previous Mentees" : "Assigned Mentees"}</strong>
          <p className="text">{history ? "Review previous discipleship journeys by person." : "Select a mentee to open their weekly progress."}</p>
        </div>
        <div className="list">
          {rows.map((row) => (
            <a className="listItem" href="/mentor/records" key={row.name} onClick={() => selectProgram({
              name: row.name,
              mentor: row.mentor,
              week: row.week,
              status: getResolvedProgramStatus(row)
            }, "mentor")}>
              <strong>{row.name}</strong>
              <span className="status">{row.week} / {getResolvedProgramStatus(row)}</span>
            </a>
          ))}
        </div>
      </div>
      <MentorTabBar active="dashboard" />
    </Phone>
  );
}

export function MentorRecordScreen() {
  const [records, setRecords] = useState(() => createEmptyRecords());
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [testimony, setTestimony] = useState(null);
  const [selectedProgram, setSelectedProgram] = useState(DEFAULT_PROGRAM);
  const [programSource, setProgramSource] = useState("");
  const [trainingRecord, setTrainingRecord] = useState({ startDate: "", completionDate: "", leader: "" });

  useEffect(() => {
    const currentUser = readJson(STORAGE_KEYS.currentUser, null);
    const savedProgram = readJson(STORAGE_KEYS.selectedProgram, null);
    const mentorProgram = getAllPrograms().find((program) => program.mentor === currentUser?.name && getResolvedProgramStatus(program) !== "Completed");
    const nextSelectedProgram = currentUser?.role === "Mentor" && savedProgram?.mentor !== currentUser.name
      ? mentorProgram || savedProgram || DEFAULT_PROGRAM
      : savedProgram || mentorProgram || DEFAULT_PROGRAM;
    setUser(currentUser);
    setSelectedProgram(nextSelectedProgram);
    setProgramSource(readJson(STORAGE_KEYS.selectedProgramSource, ""));
    setRecords(readProgramRecords(nextSelectedProgram));
    setTestimony(readMenteeTestimony(nextSelectedProgram.name));
    const menteeProfile = getMemberProfile(nextSelectedProgram.name);
    setTrainingRecord({
      startDate: menteeProfile?.mentorTrainingStartDate || "",
      completionDate: menteeProfile?.mentorTrainingCompletionDate || "",
      leader: menteeProfile?.mentorTrainingLeader || ""
    });
  }, []);

  const isAdminView = user?.role === "Admin" || programSource.startsWith("admin");
  const canEditRecords = user?.role === "Mentor" && !programSource.startsWith("admin");
  const backHref = programSource === "admin-member" ? "/admin/member-info" : isAdminView ? "/admin/monitoring" : "/mentor/dashboard";

  function updateRecord(week, field, value) {
    if (!canEditRecords) return;

    setRecords((current) => {
      return current.map((record) =>
        record.week === week ? { ...record, [field]: value } : record
      );
    });
    setMessage("");
  }

  function updateTrainingRecord(field, value) {
    if (!canEditRecords) return;
    setTrainingRecord((current) => ({ ...current, [field]: value }));
    setMessage("");
  }

  async function saveRecords() {
    if (!canEditRecords) return;
    try {
      writeProgramRecords(programDetails, records);
      setSelectedProgram(findProgram({ ...programDetails, week: getProgramWeekLabel(programDetails) }));
      let users = readJson(STORAGE_KEYS.users, []);
      if (isFirebaseConfigured) {
        const firestoreUsers = await readFirestoreUsers();
        if (firestoreUsers.length) users = firestoreUsers;
      }
      const mentee = users.find((candidate) => candidate.name === programDetails.name);
      if (mentee) {
        const nextMentee = {
          ...mentee,
          mentorTrainingStartDate: trainingRecord.startDate,
          mentorTrainingCompletionDate: trainingRecord.completionDate,
          mentorTrainingLeader: trainingRecord.leader
        };
        writeJson(STORAGE_KEYS.users, users.map((candidate) => candidate.id === mentee.id ? nextMentee : candidate));
        if (isFirebaseConfigured && nextMentee.id) {
          await updateDoc(doc(db, "users", nextMentee.id), {
            mentorTrainingStartDate: nextMentee.mentorTrainingStartDate,
            mentorTrainingCompletionDate: nextMentee.mentorTrainingCompletionDate,
            mentorTrainingLeader: nextMentee.mentorTrainingLeader
          });
        }
      }
      setMessage("Record saved. Mentee and Admin can now view these updates.");
    } catch {
      setMessage("Record could not be saved. Please try again.");
    }
  }

  const title = isAdminView ? selectedProgram.status : "Weekly Record";
  const programDetails = findProgram(selectedProgram);
  const menteeProfile = getMemberProfile(programDetails.name);
  const displayedWeek = getCompletedRecordWeek(records) ? `Week ${getCompletedRecordWeek(records)}` : programDetails.week;
  const startDate = getProgramStartDate(programDetails, records);
  const description = isAdminView
    ? `${programDetails.mentor} / ${displayedWeek} / ${programDetails.status}`
    : "Track date, QT, memorizing verse, and special notes for each week.";

  return (
    <Phone id="mentor-record">
      <AppBar title={title} left={<IconButton href={backHref}>‹</IconButton>} right={<IconButton href="/">⌂</IconButton>} />
      <div className="content">
        <div className="card cardFilled"><strong>{programDetails.name}</strong><p className="text">{description}</p></div>
        <div className="menteeMeta">
          <span><strong>Name</strong>{programDetails.name}</span>
          <span><strong>Group</strong>{menteeProfile?.church || menteeProfile?.contact || "No group assigned"}</span>
          <span><strong>Start</strong>{startDate}</span>
        </div>
        <div className="weekTable">
          <div className="weekRow weekHead"><span>Week</span><span>Date</span><span>QT</span><span>Memorizing Verse</span><span>Special Notes</span></div>
          {records.map((record) => (
            <div className="weekRow" key={record.week}>
              <span>{record.week}</span>
              <span className="dateCell"><DatePickerCell record={record} canEditRecords={canEditRecords} onChange={(value) => updateRecord(record.week, "date", value)} /></span>
              <span className="checkBoxCell"><input checked={record.qt} disabled={!canEditRecords} onChange={(event) => updateRecord(record.week, "qt", event.target.checked)} type="checkbox" /></span>
              <span className="checkBoxCell"><input checked={record.verse} disabled={!canEditRecords} onChange={(event) => updateRecord(record.week, "verse", event.target.checked)} type="checkbox" /></span>
              <span>{canEditRecords ? <input className="tableInput" value={record.notes} onChange={(event) => updateRecord(record.week, "notes", event.target.value)} placeholder="Notes" /> : <span className="readonlyText">{record.notes || "Notes"}</span>}</span>
            </div>
          ))}
        </div>
        <div className="card cardFilled">
          <strong>Mentor Training Course</strong>
          <p className="text">Record only who led the training, when it began, and when it was completed.</p>
        </div>
        <div className="trainingRecordGrid">
          <Field label="Training Leader">
            {canEditRecords ? (
              <input className="input" value={trainingRecord.leader} onChange={(event) => updateTrainingRecord("leader", event.target.value)} placeholder="Name of training leader" />
            ) : (
              <span className="readonlyText">{trainingRecord.leader || "-"}</span>
            )}
          </Field>
          <div className="trainingDateRow">
            <Field label="Start Date">
              <DatePickerCell
                record={{ week: "mentor-training-start", date: trainingRecord.startDate }}
                canEditRecords={canEditRecords}
                onChange={(value) => updateTrainingRecord("startDate", value)}
              />
            </Field>
            <Field label="Completion Date">
              <DatePickerCell
                record={{ week: "mentor-training-completion", date: trainingRecord.completionDate }}
                canEditRecords={canEditRecords}
                onChange={(value) => updateTrainingRecord("completionDate", value)}
              />
            </Field>
          </div>
        </div>
        {canEditRecords ? <div className="bottomActions"><button className="button" type="button" onClick={saveRecords}>Save Record</button></div> : null}
        <div className="list">
          <div className="listItem">
            <strong>Testimony Upload Status</strong>
            <span className={`status ${testimony?.status === "Submitted" ? "ok" : "warn"}`}>
              {testimony?.status === "Submitted" ? "Completed" : "Not uploaded"}
            </span>
            {testimony?.title ? <p className="text">{testimony.title} / {testimony.status || "Draft"}</p> : null}
            {isAdminView ? <p className="text">{testimony?.body || "The mentee testimony will appear here after submission."}</p> : null}
          </div>
        </div>
        {message ? <p className="message">{message}</p> : null}
      </div>
      {isAdminView ? <AdminTabBar active="dashboard" /> : <MentorTabBar active="dashboard" />}
    </Phone>
  );
}

export function ResourceScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
  const [resourceSource, setResourceSource] = useState("");

  useEffect(() => {
    const currentUser = readJson(STORAGE_KEYS.currentUser, null);
    setUser(currentUser);
    const defaultResourceSource = currentUser?.role === "Admin" ? "admin" : currentUser?.role === "Mentee" ? "mentee" : "mentor";
    setResourceSource(readJson(STORAGE_KEYS.resourceSource, defaultResourceSource));
  }, []);

  const isAdminResourceView = user?.role === "Admin" || resourceSource === "admin";
  const isMenteeResourceView = user?.role === "Mentee" || resourceSource === "mentee";
  const backHref = isAdminResourceView ? "/admin" : isMenteeResourceView ? "/mentee/dashboard" : "/mentor/dashboard";
  const secondaryHref = isAdminResourceView ? "/admin" : isMenteeResourceView ? "/mentee/records" : "/mentor/dashboard";
  const secondaryLabel = isAdminResourceView ? "Members" : isMenteeResourceView ? "My records" : "My Dashboard";
  const fourthHref = isAdminResourceView ? "/admin/reports" : "/profile";
  const fourthLabel = isAdminResourceView ? "Reports" : "Profile";
  const visibleResources = resources.filter((resource) =>
    resource.title.toLowerCase().includes(query.toLowerCase())
  );

  function openResource(resource) {
    selectResource(resource);
    router.push("/mentor/resources/file");
  }

  return (
    <Phone id="mentor-resource">
      <AppBar title="Resources" left={<IconButton href={backHref}>‹</IconButton>} right={<IconButton href={backHref}>⌂</IconButton>} />
      <div className="content">
        <Field label="Resources Search"><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by resource title" /></Field>
        <div className="list">
          {visibleResources.map((resource) => (
            <button className="listItem listButton" key={resource.title} type="button" onClick={() => openResource(resource)}>
              <strong>{resource.title}</strong>
              <span className="status">{resource.meta}</span>
            </button>
          ))}
        </div>
        {message ? <p className="message">{message}</p> : null}
        <div className="bottomActions">
          {isAdminResourceView ? (
            <button className="button" type="button" onClick={() => visibleResources[0] ? openResource(visibleResources[0]) : setMessage("Select a resource first.")}>Add Drive Link</button>
          ) : (
            <p className="message">Only Admin can upload resources.</p>
          )}
        </div>
      </div>
      {isMenteeResourceView ? <MenteeTabBar active="resources" /> : isAdminResourceView ? <AdminTabBar active="resources" /> : <MentorTabBar active="resources" />}
    </Phone>
  );
}

export function ResourceFileScreen() {
  const [resource, setResource] = useState(resources[0]);
  const [resourceSource, setResourceSource] = useState("");
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState({});
  const [driveForms, setDriveForms] = useState({});

  useEffect(() => {
    const currentUser = readJson(STORAGE_KEYS.currentUser, null);
    const selectedResource = readJson(STORAGE_KEYS.selectedResource, resources[0]);
    setUser(currentUser);
    setResource(selectedResource);
    const defaultResourceSource = currentUser?.role === "Admin" ? "admin" : currentUser?.role === "Mentee" ? "mentee" : "mentor";
    setResourceSource(readJson(STORAGE_KEYS.resourceSource, defaultResourceSource));
    setUploadedFiles(readResourceFiles());
    readFirestoreResourceFiles()
      .then(setUploadedFiles)
      .catch(() => setMessage("Resource links could not be loaded from Firestore yet."));
  }, []);

  const isAdminResourceView = user?.role === "Admin" || resourceSource === "admin";
  const isMenteeResourceView = user?.role === "Mentee" || resourceSource === "mentee";
  const isDiscipleshipGuide = resource.title === "Discipleship Guide";
  const isTestimonyGuide = resource.title === "Testimony Writing Guide";
  const canDownloadResource = isAdminResourceView || (isMenteeResourceView ? isTestimonyGuide : user?.role === "Mentor" || resourceSource === "mentor");
  const homeHref = isAdminResourceView ? "/" : isMenteeResourceView ? "/mentee/dashboard" : "/mentor/dashboard";
  const secondaryHref = isAdminResourceView ? "/admin" : isMenteeResourceView ? "/mentee/records" : "/mentor/dashboard";
  const secondaryLabel = isAdminResourceView ? "Members" : isMenteeResourceView ? "My records" : "My Dashboard";
  const fourthHref = isAdminResourceView ? "/admin/reports" : "/profile";
  const fourthLabel = isAdminResourceView ? "Reports" : "Profile";
  const selectedFile = uploadedFiles[getResourceFileKey(resource)];

  function updateDriveForm(week, field, value) {
    const key = getResourceFileKey(resource, week);
    setDriveForms((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: value
      }
    }));
  }

  async function saveDriveLink(week) {
    const key = getResourceFileKey(resource, week);
    const link = driveForms[key] || {};
    try {
      if (!link.name || !link.downloadUrl) {
        setMessage("Enter both file name and Google Drive link.");
        return;
      }
      setMessage(`${link.name} saving...`);
      await writeFirestoreResourceLink(resource, link, week, user);
      setUploadedFiles(await readFirestoreResourceFiles());
      setDriveForms((current) => ({ ...current, [key]: { name: "", downloadUrl: "" } }));
      setMessage(`${link.name} Drive link saved.`);
    } catch {
      setMessage("Drive link could not be saved. Please check the link and try again.");
    }
  }

  async function removeFile(week) {
    const file = uploadedFiles[getResourceFileKey(resource, week)];
    try {
      await deleteFirestoreResourceFile(resource, week, file);
      setUploadedFiles(isFirebaseConfigured ? await readFirestoreResourceFiles() : readResourceFiles());
      setMessage("File deleted.");
    } catch {
      setMessage("File link delete failed. Please check Firestore rules and try again.");
    }
  }

  function downloadFile(file, fallbackTitle) {
    if (!file?.dataUrl && !file?.downloadUrl) {
      setMessage(`${fallbackTitle} has no uploaded file yet.`);
      return;
    }
    downloadResourceFile(file);
    setMessage(`${file.name} downloaded.`);
  }

  return (
    <Phone id="resource-file">
      <AppBar title="Resource File" left={<IconButton href="/mentor/resources">‹</IconButton>} right={<IconButton href={homeHref}>⌂</IconButton>} />
      <div className="content">
        <div className="card cardFilled">
          <strong>{resource.title}</strong>
          <p className="text">{resource.meta}</p>
        </div>
        {isDiscipleshipGuide ? (
          <div className="list">
            {discipleshipGuideFiles.map((file) => (
              <div className="listItem" key={file.week}>
                {(() => {
                  const uploadedFile = uploadedFiles[getResourceFileKey(resource, file.week)];
                  const driveForm = driveForms[getResourceFileKey(resource, file.week)] || {};
                  return (
                    <>
                      <div className="row"><strong>{file.title}</strong><span className="status">{uploadedFile?.name || file.fileName}</span></div>
                      <span className="status">{uploadedFile ? `Linked ${uploadedFile.uploadedAt} by ${uploadedFile.uploadedBy}` : "No Google Drive link yet"}</span>
                      {isAdminResourceView ? (
                        <div className="driveLinkForm">
                          <input className="input" value={driveForm.name || ""} onChange={(event) => updateDriveForm(file.week, "name", event.target.value)} placeholder="File name" />
                          <input className="input" value={driveForm.downloadUrl || ""} onChange={(event) => updateDriveForm(file.week, "downloadUrl", event.target.value)} placeholder="Google Drive share link" />
                        </div>
                      ) : null}
                      <div className="resourceActions">
                        {isAdminResourceView ? (
                          <>
                            <button className="smallActionButton" type="button" onClick={() => saveDriveLink(file.week)}>Save Link</button>
                            <button className="smallActionButton dangerAction" type="button" onClick={() => removeFile(file.week)}>Delete</button>
                          </>
                        ) : null}
                        {canDownloadResource ? (
                          <button className="smallActionButton" type="button" onClick={() => downloadFile(uploadedFile, file.title)}>Download</button>
                        ) : null}
                      </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="list">
              <div className="listItem"><strong>Linked File</strong><span className="status">{selectedFile?.name || resource.fileName || `${resource.title.toLowerCase().replaceAll(" ", "-")}.pdf`}</span></div>
              <div className="listItem"><strong>Linked By</strong><span className="status">{selectedFile?.uploadedBy || resource.uploadedBy || "Admin User"}</span></div>
              <div className="listItem"><strong>Linked Date</strong><span className="status">{selectedFile?.uploadedAt || resource.uploadedAt || "2026-05-15"}</span></div>
            </div>
            <div className="card">
              <strong>File Preview</strong>
              <p className="text">{selectedFile ? `${selectedFile.name} is ready to open from Google Drive.` : "Add a Google Drive link as Admin to make it available for download."}</p>
            </div>
            {isAdminResourceView ? (
              <div className="driveLinkForm">
                <input className="input" value={driveForms[getResourceFileKey(resource)]?.name || ""} onChange={(event) => updateDriveForm(undefined, "name", event.target.value)} placeholder="File name" />
                <input className="input" value={driveForms[getResourceFileKey(resource)]?.downloadUrl || ""} onChange={(event) => updateDriveForm(undefined, "downloadUrl", event.target.value)} placeholder="Google Drive share link" />
              </div>
            ) : null}
            <div className="resourceActions">
              {isAdminResourceView ? (
                <>
                  <button className="smallActionButton" type="button" onClick={() => saveDriveLink()}>Save Link</button>
                  <button className="smallActionButton dangerAction" type="button" onClick={() => removeFile()}>Delete</button>
                </>
              ) : null}
              {canDownloadResource ? (
                <button className="smallActionButton" type="button" onClick={() => downloadFile(selectedFile, resource.title)}>Download</button>
              ) : null}
            </div>
          </>
        )}
        {message ? <p className="message">{message}</p> : null}
        <div className="bottomActions">
          <a className="button buttonSecondary" href="/mentor/resources">Back to Resources</a>
        </div>
      </div>
      {isMenteeResourceView ? <MenteeTabBar active="resources" /> : isAdminResourceView ? <AdminTabBar active="resources" /> : <MentorTabBar active="resources" />}
    </Phone>
  );
}

export function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ name: "", birthDate: "", phone: "", contact: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const currentUser = readJson(STORAGE_KEYS.currentUser, null);
    const users = readJson(STORAGE_KEYS.users, []);
    const freshUser = users.find((candidate) => candidate.id === currentUser?.id || candidate.email === currentUser?.email);
    const nextUser = freshUser || currentUser;
    setUser(nextUser);
    setForm({
      name: nextUser?.name || "",
      birthDate: nextUser?.birthDate || "",
      phone: nextUser?.phone || "",
      contact: nextUser?.contact || nextUser?.church || ""
    });
  }, []);

  function updateProfileField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile() {
    if (!user) {
      setMessage("Please log in first.");
      return;
    }

    const nextUser = {
      ...user,
      name: form.name,
      birthDate: form.birthDate,
      phone: form.phone,
      contact: form.contact,
      church: form.contact,
      updatedAt: new Date().toISOString()
    };

    try {
      if (isFirebaseConfigured) {
        await updateDoc(doc(db, "users", user.id), {
          name: nextUser.name,
          birthDate: nextUser.birthDate,
          phone: nextUser.phone,
          contact: nextUser.contact,
          church: nextUser.church,
          updatedAt: nextUser.updatedAt
        });
      }
      const users = readJson(STORAGE_KEYS.users, []);
      writeJson(STORAGE_KEYS.users, users.map((candidate) => candidate.id === user.id ? nextUser : candidate));
      writeJson(STORAGE_KEYS.currentUser, nextUser);
      setUser(nextUser);
      setIsEditing(false);
      setMessage("Profile updated.");
    } catch {
      setMessage("Profile could not be saved. Please try again.");
    }
  }

  function logOut() {
    window.localStorage.removeItem(STORAGE_KEYS.currentUser);
    router.push("/login");
  }

  const isAdminProfile = user?.role === "Admin";
  const isMentorProfile = user?.role === "Mentor";
  const homeHref = "/";
  const recordsHref = isAdminProfile ? "/admin/monitoring" : isMentorProfile ? "/mentor/dashboard" : "/mentee/records";
  const resourcesHref = "/mentor/resources";
  const fourthHref = isAdminProfile ? "/admin/reports" : "/profile";

  return (
    <Phone>
      <AppBar title="Profile" right={<IconButton href="/">⌂</IconButton>} />
      <div className="content">
        <div className="card cardFilled"><strong>{user?.name || "Guest User"}</strong><p className="text">{user?.role || "No Role"} / {user?.email || "not logged in"}</p></div>
        {isEditing ? (
          <div className="list">
            <Field label="Name"><input className="input" value={form.name} onChange={(event) => updateProfileField("name", event.target.value)} /></Field>
            <Field label="Birth Date"><BirthDatePicker value={form.birthDate} onChange={(value) => updateProfileField("birthDate", value)} /></Field>
            <Field label="Phone"><input className="input" value={form.phone} onChange={(event) => updateProfileField("phone", event.target.value)} type="tel" /></Field>
            <Field label="Community"><input className="input" value={form.contact} onChange={(event) => updateProfileField("contact", event.target.value)} /></Field>
            <div className="listItem"><strong>Email</strong><span className="status">{user?.email || "-"}</span></div>
            <div className="listItem"><strong>Role</strong><span className="status">{user?.role || "Guest"}</span></div>
          </div>
        ) : (
          <div className="list"><div className="listItem"><strong>Birth Date</strong><span className="status">{user?.birthDate || "-"}</span></div><div className="listItem"><strong>Phone</strong><span className="status">{user?.phone || "-"}</span></div><div className="listItem"><strong>Email</strong><span className="status">{user?.email || "-"}</span></div><div className="listItem"><strong>Community</strong><span className="status">{user?.contact || user?.church || "Companion Community"}</span></div><div className="listItem"><strong>Role</strong><span className="status">{user?.role || "Guest"}</span></div></div>
        )}
        {message ? <p className="message">{message}</p> : null}
        <div className="bottomActions">
          {isEditing ? (
            <>
              <button className="button" type="button" onClick={saveProfile}>Save Profile</button>
              <button className="button buttonSecondary" type="button" onClick={() => setIsEditing(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button className="button" type="button" onClick={() => setIsEditing(true)}>Edit Profile</button>
              <button className="button buttonSecondary" type="button" onClick={logOut}>Log Out</button>
            </>
          )}
        </div>
      </div>
      {!isAdminProfile && !isMentorProfile ? <MenteeTabBar active="profile" /> : isAdminProfile ? <AdminTabBar active="dashboard" /> : <MentorTabBar active="profile" />}
    </Phone>
  );
}

export function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadUsers() {
      try {
        const nextUsers = await readFirestoreUsers();
        const usersWithAdmin = nextUsers.length ? nextUsers : TEST_USERS;
        writeJson(STORAGE_KEYS.users, usersWithAdmin);
        setUsers(usersWithAdmin);
      } catch {
        ensureTestUsers();
        setUsers(readJson(STORAGE_KEYS.users, []));
        setMessage("Dashboard is showing saved browser data. Firestore could not be reached.");
      }
    }
    loadUsers();
  }, []);

  const totalMembers = users.length;
  const activeMembers = users.filter((user) => user.approved).length;
  const pendingMembers = users.filter((user) => !user.approved).length;

  return (
    <Phone>
      <AppBar title="Admin Dashboard" right={<IconButton href="/">⌂</IconButton>} />
      <div className="content">
        <div className="metricGrid3"><div className="metric"><span className="label">Total Members</span><h3>{totalMembers}</h3></div><div className="metric"><span className="label">Active Members</span><h3>{activeMembers}</h3></div><a className="metric metricLink" href="/admin/members?filter=pending"><span className="label">Pending Members</span><h3>{pendingMembers}</h3></a></div>
        <div className="list">
          <a className="listItem" href="/admin/members"><strong>Member Management</strong><span className="status">Approve, assign roles, and manage members</span></a>
          <a className="listItem" href="/admin/monitoring"><strong>Disciple Monitoring</strong><span className="status">Track active and completed discipleship</span></a>
          <a className="listItem" href="/admin/reports"><strong>Statics and Reports</strong><span className="status">Review progress charts and reports</span></a>
        </div>
        {message ? <p className="message">{message}</p> : null}
      </div>
      <AdminTabBar active="dashboard" />
    </Phone>
  );
}

export function AdminReports() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    async function loadUsers() {
      try {
        const nextUsers = await readFirestoreUsers();
        const usersWithAdmin = nextUsers.length ? nextUsers : TEST_USERS;
        writeJson(STORAGE_KEYS.users, usersWithAdmin);
        setUsers(usersWithAdmin);
      } catch {
        ensureTestUsers();
        setUsers(readJson(STORAGE_KEYS.users, []));
      }
    }
    loadUsers();
  }, []);

  const roleStats = [
    { label: "Mentors", value: users.filter((user) => user.role === "Mentor").length },
    { label: "Mentees", value: users.filter((user) => user.role === "Mentee").length },
    { label: "Admins", value: users.filter((user) => user.role === "Admin").length }
  ];
  const progressStats = [
    { label: "In Progress", value: getAllPrograms().filter((program) => getResolvedProgramStatus(program) !== "Completed").length },
    { label: "Completed", value: getAllPrograms().filter((program) => getResolvedProgramStatus(program) === "Completed").length }
  ];
  const maxRoleValue = Math.max(1, ...roleStats.map((item) => item.value));
  const maxProgressValue = Math.max(1, ...progressStats.map((item) => item.value));

  return (
    <Phone>
      <AppBar title="Reports" left={<IconButton href="/admin">‹</IconButton>} right={<IconButton href="/">⌂</IconButton>} />
      <div className="content">
        <div className="card cardFilled"><strong>Member Statistics</strong><p className="text">Current member roles and discipleship progress at a glance.</p></div>
        <div className="grid2"><div className="metric"><span className="label">Mentors</span><h3>{roleStats[0].value}</h3></div><div className="metric"><span className="label">Mentees</span><h3>{roleStats[1].value}</h3></div></div>
        <div className="chartCard">
          <strong>Members by Role</strong>
          {roleStats.map((item) => (
            <div className="chartRow" key={item.label}>
              <span>{item.label}</span>
              <div className="chartTrack"><span style={{ width: `${Math.round((item.value / maxRoleValue) * 100)}%` }} /></div>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
        <div className="chartCard">
          <strong>Discipleship Progress</strong>
          {progressStats.map((item) => (
            <div className="chartRow" key={item.label}>
              <span>{item.label}</span>
              <div className="chartTrack"><span style={{ width: `${Math.round((item.value / maxProgressValue) * 100)}%` }} /></div>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>
      <AdminTabBar active="dashboard" />
    </Phone>
  );
}

export function AdminQna() {
  const router = useRouter();
  const [requests, setRequests] = useState([]);
  const [answers, setAnswers] = useState({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    const queuedRequests = readJson(STORAGE_KEYS.adminRequests, []);
    const now = new Date().toISOString();
    const readRequests = queuedRequests.map((request) => request.readAt ? request : { ...request, readAt: now });
    if (queuedRequests.some((request) => !request.readAt)) {
      writeJson(STORAGE_KEYS.adminRequests, readRequests);
    }
    setRequests(readRequests);
  }, []);

  function openRequest(request) {
    if (request.type === "signup" || request.memberId || request.memberEmail) {
      const users = readJson(STORAGE_KEYS.users, []);
      const member = users.find((user) => user.id === request.memberId || user.email === request.memberEmail || user.email === request.senderEmail);
      if (member) {
        writeJson(STORAGE_KEYS.selectedMember, member);
        router.push("/admin/members?filter=pending");
        return;
      }
      router.push("/admin/members?filter=pending");
      return;
    }

    setMessage(`${request.title} selected.`);
  }

  function updateAnswer(requestId, value) {
    setAnswers((current) => ({ ...current, [requestId]: value }));
  }

  function submitAnswer(request) {
    const answer = (answers[request.id] || "").trim();
    if (!answer) {
      setMessage("Please enter an answer first.");
      return;
    }

    const storedRequests = readJson(STORAGE_KEYS.adminRequests, []);
    const nextRequests = storedRequests.map((storedRequest) =>
      storedRequest.id === request.id
        ? { ...storedRequest, answer, status: "Answered", answeredAt: new Date().toISOString() }
        : storedRequest
    );
    writeJson(STORAGE_KEYS.adminRequests, nextRequests);
    setRequests((current) => current.map((currentRequest) =>
      currentRequest.id === request.id
        ? { ...currentRequest, answer, status: "Answered", answeredAt: new Date().toISOString() }
        : currentRequest
    ));
    setAnswers((current) => ({ ...current, [request.id]: "" }));
    setMessage("Answer saved for the requester.");
  }

  return (
    <Phone>
      <AppBar title="Q & A" left={<IconButton href="/admin">‹</IconButton>} right={<IconButton href="/">⌂</IconButton>} />
      <div className="content">
        <div className="card cardFilled"><strong>Admin Q & A</strong><p className="text">View requests submitted by mentors and mentees.</p></div>
        <div className="list">
          {requests.map((request) => (
            <div className="listItem" key={request.id || `${request.sender}-${request.title}`}>
              <div className="row"><strong>{request.title}</strong><span className="pill">{request.status}</span></div>
              <span className="status">{request.sender} / {request.role} / {request.notificationStatus || "Email notification ready"}</span>
              <p className="text">{request.detail}</p>
              {request.answer ? <p className="message">Answer: {request.answer}</p> : null}
              {request.type === "signup" || request.memberId || request.memberEmail ? (
                <button className="smallActionButton" type="button" onClick={() => openRequest(request)}>Open Pending Members</button>
              ) : (
                <div className="qnaAnswerBox">
                  <textarea className="textarea" value={answers[request.id] || ""} onChange={(event) => updateAnswer(request.id, event.target.value)} placeholder="Write an answer" />
                  <button className="smallActionButton" type="button" onClick={() => submitAnswer(request)}>Send Answer</button>
                </div>
              )}
            </div>
          ))}
        </div>
        {message ? <p className="message">{message}</p> : null}
      </div>
      <AdminTabBar active="qna" />
    </Phone>
  );
}

export function AdminMonitoring() {
  const [inProgressPage, setInProgressPage] = useState(1);
  const [users, setUsers] = useState(() => readJson(STORAGE_KEYS.users, []));

  useEffect(() => {
    async function loadUsers() {
      try {
        const nextUsers = await readFirestoreUsers();
        const usersWithAdmin = nextUsers.length ? nextUsers : readJson(STORAGE_KEYS.users, []);
        writeJson(STORAGE_KEYS.users, usersWithAdmin);
        setUsers(usersWithAdmin);
      } catch {
        setUsers(readJson(STORAGE_KEYS.users, []));
      }
    }

    loadUsers();
  }, []);

  const allPrograms = getAllPrograms();
  const inProgressPrograms = allPrograms.filter((program) => getResolvedProgramStatus(program) !== "Completed");
  const completedPrograms = allPrograms.filter((program) => getResolvedProgramStatus(program) === "Completed");
  const pageSize = 5;
  const inProgressPageCount = Math.max(1, Math.ceil(inProgressPrograms.length / pageSize));
  const pagedInProgressPrograms = inProgressPrograms.slice(
    (inProgressPage - 1) * pageSize,
    inProgressPage * pageSize
  );

  return (
    <Phone>
      <AppBar title="Discipleship Monitoring" left={<IconButton href="/admin">‹</IconButton>} right={<IconButton href="/">⌂</IconButton>} />
      <div className="content">
        <div className="grid2">
          <div className="metric"><span className="label">In Progress</span><h3>{inProgressPrograms.length}</h3></div>
          <div className="metric"><span className="label">Completed</span><h3>{completedPrograms.length}</h3></div>
        </div>
        <div className="card cardFilled"><strong>In Progress Discipleship</strong><p className="text">Programs currently moving through the 16-week course.</p></div>
        <div className="list">
          {pagedInProgressPrograms.map((program) => {
            const displayWeek = getProgramWeekLabel(program);
            const menteeProfile = users.find((candidate) => candidate.name === program.name) || getMemberProfile(program.name);
            const trainingMessage = menteeProfile?.mentorTrainingCompletionDate
              ? `Mentor training completed: ${menteeProfile.mentorTrainingCompletionDate}`
              : "Mentor training not completed";
            return (
            <a className="listItem" href="/mentor/records" key={program.name} onClick={() => selectProgram({ ...program, week: displayWeek }, "admin")}>
              <div className="row"><strong>{program.name}</strong><span className="pill">In Progress</span></div>
              <span className="status">{program.mentor} / {displayWeek}</span>
              <span className={`status trainingStatus ${menteeProfile?.mentorTrainingCompletionDate ? "ok" : "warn"}`}>{trainingMessage}</span>
            </a>
          );
          })}
        </div>
        {inProgressPageCount > 1 ? (
          <div className="pagination">
            <button className="paginationButton" type="button" disabled={inProgressPage === 1} onClick={() => setInProgressPage((page) => Math.max(1, page - 1))}>Previous</button>
            <span className="status">Page {inProgressPage} of {inProgressPageCount}</span>
            <button className="paginationButton" type="button" disabled={inProgressPage === inProgressPageCount} onClick={() => setInProgressPage((page) => Math.min(inProgressPageCount, page + 1))}>Next</button>
          </div>
        ) : null}
        <details className="accordion">
          <summary className="card cardFilled accordionSummary">
            <span>
              <strong>Completed Discipleship</strong>
              <span className="text">Programs that have completed the full course.</span>
            </span>
            <span className="pill">{completedPrograms.length}</span>
          </summary>
          <div className="list accordionContent">
            {completedPrograms.map((program) => (
              <a className="listItem" href="/mentor/records" key={program.name} onClick={() => selectProgram(program, "admin")}>
                <div className="row"><strong>{program.name}</strong><span className="pill">Completed</span></div>
                <span className="status">{program.mentor} / {program.week}</span>
              </a>
            ))}
          </div>
        </details>
      </div>
      <AdminTabBar active="dashboard" />
    </Phone>
  );
}

export function AdminMembers() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedMentorName, setSelectedMentorName] = useState("");
  const [memberPage, setMemberPage] = useState(1);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadUsers() {
      try {
        const nextUsers = await readFirestoreUsers();
        writeJson(STORAGE_KEYS.users, nextUsers);
        setUsers(nextUsers);
        setSelectedUserId(nextUsers[0]?.id || "");
        setSelectedMentorName(nextUsers.find((user) => user.role === "Mentor")?.name || "");
      } catch {
        ensureTestUsers();
        const nextUsers = readJson(STORAGE_KEYS.users, []);
        setUsers(nextUsers);
        setSelectedUserId(nextUsers[0]?.id || "");
        setSelectedMentorName(nextUsers.find((user) => user.role === "Mentor")?.name || "");
        setMessage("Members loaded from this browser. Firestore could not be reached.");
      }
    }
    loadUsers();
    setPendingOnly(new URLSearchParams(window.location.search).get("filter") === "pending");
  }, []);

  const filteredUsers = pendingOnly ? users.filter((user) => !user.approved) : users;
  const visibleUsers = filteredUsers
    .filter((user) => {
      const searchText = `${user.name} ${user.email} ${user.role}`.toLowerCase();
      return searchText.includes(query.toLowerCase());
    });
  const memberPageSize = 7;
  const memberPageCount = Math.max(1, Math.ceil(visibleUsers.length / memberPageSize));
  const pagedUsers = visibleUsers.slice(
    (memberPage - 1) * memberPageSize,
    memberPage * memberPageSize
  );
  const selectedUser = users.find((user) => user.id === selectedUserId);
  const mentors = users.filter((user) => user.role === "Mentor" && user.approved);
  const selectedProgramForUser = selectedUser?.role === "Mentee"
    ? getAllPrograms().find((program) => program.name === selectedUser.name && getResolvedProgramStatus(program) !== "Completed")
    : null;

  function saveUsers(nextUsers, nextMessage) {
    setUsers(nextUsers);
    writeJson(STORAGE_KEYS.users, nextUsers);
    setMessage(nextMessage);
  }

  async function approveSelected() {
    if (!selectedUser) {
      setMessage("Select a member first.");
      return;
    }

    if (selectedUser.approved) {
      setMessage(`${selectedUser.name} is already active.`);
      return;
    }

    const nextUser = { ...selectedUser, approved: true, approvedAt: new Date().toISOString() };
    try {
      await updateDoc(doc(db, "users", selectedUser.id), {
        approved: true,
        approvedAt: nextUser.approvedAt
      });
      saveUsers(
        users.map((user) => user.id === selectedUser.id ? nextUser : user),
        `${selectedUser.name} approved.`
      );
    } catch {
      setMessage("Approval could not be saved to Firestore. Please try again.");
    }
  }

  async function changeSelectedRole() {
    if (!selectedUser) {
      setMessage("Select a member first.");
      return;
    }

    const nextRole = selectedUser.role === "Mentee" ? "Mentor" : selectedUser.role === "Mentor" ? "Admin" : "Mentee";
    const nextUser = { ...selectedUser, role: nextRole };
    try {
      await updateDoc(doc(db, "users", selectedUser.id), { role: nextRole });
      saveUsers(
        users.map((user) => user.id === selectedUser.id ? nextUser : user),
        `${selectedUser.name} changed to ${nextRole}.`
      );
    } catch {
      setMessage("Role change could not be saved to Firestore. Please try again.");
    }
  }

  async function deleteSelectedMember() {
    if (!selectedUser) {
      setMessage("Select a member first.");
      return;
    }
    if (selectedUser.email === ADMIN_EMAIL) {
      setMessage("The primary Admin account cannot be deleted here.");
      return;
    }
    const confirmed = window.confirm(`Delete ${selectedUser.name}? This removes the member from Member Management.`);
    if (!confirmed) return;

    try {
      if (isFirebaseConfigured) {
        await deleteDoc(doc(db, "users", selectedUser.id));
      }
      const nextUsers = users.filter((user) => user.id !== selectedUser.id);
      saveUsers(nextUsers, `${selectedUser.name} deleted.`);
      setSelectedUserId(nextUsers[0]?.id || "");
      setSelectedMentorName(nextUsers.find((user) => user.role === "Mentor")?.name || "");
    } catch {
      setMessage("Member could not be deleted from Firestore. Please try again.");
    }
  }

  function assignMentor() {
    if (!selectedUser) {
      setMessage("Select a member first.");
      return;
    }
    if (selectedUser.role !== "Mentee") {
      setMessage("Mentor assignment is only available for mentees.");
      return;
    }
    if (!selectedMentorName) {
      setMessage("Select a mentor first.");
      return;
    }

    const nextProgram = writeAssignedProgram(selectedUser, selectedMentorName);
    setMessage(`${selectedUser.name} assigned to ${nextProgram.mentor}. Progress starts at Week 0.`);
  }

  function openMemberInfo(member) {
    if (!member) {
      setMessage("Select a member first.");
      return;
    }

    writeJson(STORAGE_KEYS.selectedMember, member);
    router.push("/admin/member-info");
  }

  function openSelectedMemberInfo() {
    openMemberInfo(selectedUser);
  }

  function selectMember(user) {
    setSelectedUserId(user.id);
    setMessage(`${user.name} selected.`);
  }

  return (
    <Phone>
      <AppBar title="Member Management" left={<IconButton href="/admin">‹</IconButton>} right={<IconButton href="/">⌂</IconButton>} />
      <div className="content">
        {pendingOnly ? <div className="card cardFilled"><strong>Pending Members</strong><p className="text">Only members waiting for admin approval are shown.</p></div> : null}
        <Field label="Member Search">
          <div className="searchBox">
            <button className="searchButton" type="button" onClick={() => setMessage(query ? `Searching for "${query}".` : "Enter a search term.")}>⌕</button>
            <input className="input searchInput" value={query} onChange={(event) => { setQuery(event.target.value); setMemberPage(1); }} placeholder="Search name, email, or role" />
          </div>
        </Field>
        <div className="table">
          <div className="tableRow tableHead memberTableRow"><span>Name</span><span>Role</span><span>Status</span><span>Select</span></div>
          {pagedUsers.map((user) => (
            <div className={`tableRow memberTableRow ${selectedUserId === user.id ? "selectedRow" : ""}`} key={user.id}>
              <span><button className="memberSelectButton" type="button" onClick={() => openMemberInfo(user)}>{user.name}</button></span>
              <span>{user.role}</span>
              <span>{user.approved ? "Active" : "Pending"}</span>
              <span><button className="selectMemberButton" type="button" onClick={() => selectMember(user)}>{selectedUserId === user.id ? "Selected" : "Select"}</button></span>
            </div>
          ))}
        </div>
        {memberPageCount > 1 ? (
          <div className="pagination">
            <button className="paginationButton" type="button" disabled={memberPage === 1} onClick={() => setMemberPage((page) => Math.max(1, page - 1))}>Previous</button>
            <span className="status">Page {memberPage} of {memberPageCount}</span>
            <button className="paginationButton" type="button" disabled={memberPage === memberPageCount} onClick={() => setMemberPage((page) => Math.min(memberPageCount, page + 1))}>Next</button>
          </div>
        ) : null}
        {message ? <p className="message">{message}</p> : null}
        {selectedUser?.role === "Mentee" ? (
          <div className="card">
            <strong>Assign Mentor</strong>
            <p className="text">Current mentor: {selectedProgramForUser?.mentor || "Not assigned"}</p>
            <Field label="Mentor">
              <select className="input" value={selectedMentorName} onChange={(event) => setSelectedMentorName(event.target.value)}>
                {mentors.map((mentor) => <option key={mentor.id} value={mentor.name}>{mentor.name}</option>)}
              </select>
            </Field>
            <button className="button buttonSecondary" type="button" onClick={assignMentor}>Assign Mentor</button>
          </div>
        ) : null}
        <div className="grid2"><button className="button buttonSecondary" type="button" onClick={openSelectedMemberInfo}>View Member Info</button><button className="button buttonSecondary" type="button" onClick={changeSelectedRole}>Change Role</button></div>
        <button className="button buttonDanger" type="button" onClick={deleteSelectedMember}>Delete Member</button>
        <div className="bottomActions"><button className="button" type="button" onClick={approveSelected}>Approve Pending Member</button></div>
      </div>
      <AdminTabBar active="dashboard" />
    </Phone>
  );
}

export function AdminMemberInfo() {
  const [member, setMember] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadMember() {
      ensureTestUsers();
      const selectedMember = readJson(STORAGE_KEYS.selectedMember, null);
      let users = readJson(STORAGE_KEYS.users, []);

      try {
        const firestoreUsers = await readFirestoreUsers();
        if (firestoreUsers.length) {
          users = firestoreUsers;
          writeJson(STORAGE_KEYS.users, firestoreUsers);
        }
      } catch {
        setMessage("Showing saved browser data. Firestore could not be reached.");
      }

      const latestMember = selectedMember
        ? users.find((user) => user.id === selectedMember.id || user.email === selectedMember.email)
        : null;
      setMember(latestMember || selectedMember || users[0] || null);
    }

    loadMember();
  }, []);

  const history = getDiscipleshipHistory(member?.name);
  const memberTestimony = readMenteeTestimony(member?.name);

  return (
    <Phone>
      <AppBar title="Member Info" left={<IconButton href="/admin/members">‹</IconButton>} right={<IconButton href="/">⌂</IconButton>} />
      <div className="content">
        <div className="card cardFilled">
          <strong>{member?.name || "No member selected"}</strong>
          <p className="text">{member?.role || "Select a member from Member Management."}</p>
        </div>
        <div className="list">
          <div className="listItem"><strong>Name</strong><span className="status">{member?.name || "-"}</span></div>
          <div className="listItem"><strong>Birth Date</strong><span className="status">{member?.birthDate || "-"}</span></div>
          <div className="listItem"><strong>Phone</strong><span className="status">{member?.phone || "-"}</span></div>
          <div className="listItem"><strong>Email</strong><span className="status">{member?.email || "-"}</span></div>
          <div className="listItem"><strong>Church / Group</strong><span className="status">{member?.church || member?.contact || "-"}</span></div>
          <div className="listItem"><strong>Role</strong><span className="status">{member?.role || "-"}</span></div>
          <div className="listItem"><strong>Status</strong><span className="status">{member?.approved ? "Active" : "Pending Approval"}</span></div>
        </div>
        {member?.role === "Mentee" ? (
          <div className="listItem">
            <strong>Testimony</strong>
            <span className="status">{memberTestimony?.title ? `${memberTestimony.title} / ${memberTestimony.status || "Draft"}` : "No submitted testimony yet"}</span>
          </div>
        ) : null}
        <div className="card cardFilled"><strong>Discipleship History</strong><p className="text">Mentor and mentee relationships connected to this member.</p></div>
        <div className="list">
          {history.length ? history.map((program) => (
            <a className="listItem" href="/mentor/records" key={`${program.mentor}-${program.name}-${program.status}`} onClick={() => selectProgram(program, "admin-member")}>
              <div className="row"><strong>{program.mentor} → {program.name}</strong><span className="pill">{program.status}</span></div>
              <span className="status">{program.week}</span>
            </a>
          )) : (
            <div className="listItem"><strong>No discipleship record</strong><span className="status">No connected program yet.</span></div>
          )}
        </div>
        <div className="card cardFilled">
          <strong>Mentor Training Course</strong>
          <p className="text">Admin can review the training record entered by the mentor.</p>
        </div>
        <div className="list">
          <div className="listItem"><strong>Training Leader</strong><span className="status">{member?.mentorTrainingLeader || "-"}</span></div>
          <div className="listItem"><strong>Start Date</strong><span className="status">{member?.mentorTrainingStartDate || "-"}</span></div>
          <div className="listItem"><strong>Completion Date</strong><span className="status">{member?.mentorTrainingCompletionDate || "-"}</span></div>
        </div>
        {message ? <p className="message">{message}</p> : null}
        <div className="bottomActions">
          <a className="button buttonSecondary" href="/admin/members">Back to Member Management</a>
        </div>
      </div>
      <AdminTabBar active="dashboard" />
    </Phone>
  );
}

export default function Page() {
  return (
    <ScreenPage title="Home" note="Home image, login, sign-up, and ABOUT menu">
      <HomeScreen />
    </ScreenPage>
  );
}
