# Job Applications Tracker

A simple full-stack web app built with **React (Vite)** and **Supabase** to help you track job vacancies you come across and manage your application progress.

## 📝 Description

This personal tool lets you record job advertisements, company details, and positions you’re interested in, along with application status updates.  
Each record includes information such as the job ad, company name, position, date found, and whether you’ve applied, plus the application date and status (pending, interview, offer, rejected, etc.).

With Supabase providing authentication and database management, each user securely manages their own job listings under protected Row Level Security (RLS) policies.

## ⚙️ Tech Stack

- **Frontend:** React (Vite)
- **Styling:** Tailwind CSS
- **Backend / Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (Email & Password)

## 🚀 Features

- User authentication (sign up / sign in via Supabase)
- Create, read, update, and delete (CRUD) job entries
- Per-user job data isolation via RLS
- Responsive, minimal UI with Tailwind CSS

## 🧭 Project Setup

1. Clone the repository  
   ```bash
   git clone https://github.com/yourusername/job-tracker.git
   cd job-tracker
