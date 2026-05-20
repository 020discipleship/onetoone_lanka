# One to One Discipleship MVP Implementation Roadmap

## 1. MVP Goal
Build the first working mobile web version of the One to One Discipleship service.

The MVP should let users sign up, log in, use a role-based dashboard, record a 16-week discipleship course, and let admins manage members and basic progress.

## 2. Recommended MVP Scope

### Include in MVP
- Home screen with full image, login, sign-up, and ABOUT menu.
- ABOUT screen explaining One to One Discipleship.
- Sign up with requested role selection: Mentee or Mentor.
- Log in and find password flow.
- Mentee dashboard.
- Mentee weekly record detail.
- Mentee testimony writing and upload flow.
- Mentor dashboard.
- Mentor 16-week discipleship table with:
  - Week
  - Date
  - QT checkbox
  - Memorizing Verse checkbox
  - Special Notes
- Admin dashboard.
- Admin member management and role approval.

### Defer to Version 2
- Full report download.
- Advanced statistics.
- File/resource upload management.
- Email automation.
- Complex notification system.

## 3. Suggested Tech Stack

### Frontend
- React or Next.js.
- Mobile-first responsive layout.
- Component-based screens based on `mobile-wireframe.html`.

### Backend
- Supabase or Firebase for the fastest MVP.
- Alternative: Node.js API with PostgreSQL if more custom control is needed.

### Database
Core tables:
- `users`
- `profiles`
- `mentor_mentee_assignments`
- `discipleship_records`
- `testimonies`
- `resources`

## 4. User Roles

### Mentee
- View assigned mentor.
- View progress.
- Write weekly records.
- Manage testimony.
- View profile.

### Mentor
- View assigned mentees.
- Update 16-week discipleship checklist.
- Add date, QT check, memorizing verse check, and special notes.
- View mentee history.

### Admin
- Approve members.
- Change roles.
- View discipleship progress.
- Manage basic member data.

## 5. Build Order

### Phase 1: Product Foundation
- Finalize screen list from the wireframe.
- Confirm exact user roles.
- Confirm sign-up approval flow.
- Confirm whether mentors can edit only assigned mentees.

### Phase 2: App Foundation
- Create web app project.
- Add mobile layout system.
- Convert wireframe screens into reusable components.
- Add routes for Home, About, Sign Up, Log In, Find Password, dashboards, and record screens.

### Phase 3: Authentication
- Implement sign up.
- Implement log in.
- Implement find password.
- Store requested role during sign-up.
- Add admin approval state.

### Phase 4: Role-Based Dashboards
- Route Mentee users to Mentee Dashboard.
- Route Mentor users to Mentor Dashboard.
- Route Admin users to Admin Dashboard.
- Hide screens that do not belong to the current role.

### Phase 5: 16-Week Discipleship Records
- Create records for weeks 1 through 16.
- Add date field.
- Add QT checkbox.
- Add Memorizing Verse checkbox.
- Add Special Notes field.
- Save and update records.

### Phase 6: Testimony
- Let Mentees write testimony.
- Save draft.
- Upload or submit testimony.
- Let Mentor/Admin view submitted testimony in a later version if needed.

### Phase 7: Admin Tools
- Show member list.
- Approve pending users.
- Change role.
- View basic progress.

## 6. Acceptance Checklist
- User can sign up as Mentee or Mentor.
- Admin can approve user and assign role.
- User can log in.
- Mentee sees Mentee Dashboard.
- Mentor sees Mentor Dashboard.
- Admin sees Admin Dashboard.
- Mentor can fill the 16-week table.
- Data remains saved after refresh.
- Mobile layout works at 390px width.

## 7. Immediate Next Step
Choose the implementation path:

1. Fast MVP path: Supabase + React/Next.js.
2. Custom app path: Node.js backend + PostgreSQL + React/Next.js.
3. Prototype path: Static HTML/CSS/JS first, then backend later.

Recommended path: Fast MVP path with Supabase + React/Next.js.
