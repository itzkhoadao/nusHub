# NUSHub

**NUSHub** is a dedicated digital community platform for National University of Singapore students. It combines structured discussion forums with social media-style engagement, topic-based information discovery, study group collaboration, AI-assisted answers, and campus feedback reporting.

> Project status: In development phase for Orbital 26 (CP2106) with level of achievement Apollo 11.

---

## Overview

University students often rely on scattered channels such as Reddit threads, Telegram groups, informal chats, and word of mouth to find information about modules, professors, housing, canteen food, campus facilities, transport, and student life. These channels are useful, but they are often noisy, uncategorized, difficult to search, or not officially moderated.

NUSHub aims to solve this problem by providing a centralized and organized NUS-focused platform where students can:

- Browse discussions by topic or category
- Ask and answer questions about campus life
- Comment on and upvote useful responses
- Create or join study groups
- Share study resources
- Post anonymously when appropriate
- Report campus issues with photos
- Use an AI assistant for quick information lookup

---

## Motivation

Existing student information channels have several limitations:

1. **Poor discoverability on broad discussion platforms**  
   Communities such as `/r/nus` contain useful posts, but topics are mixed together and can be difficult to filter by category, module, facility, or student need.

2. **High noise in informal group chats**  
   Telegram confession-style groups may contain jokes, unrelated messages, or unverified claims, making it hard for students to extract reliable and relevant information.

3. **Lack of a centralized student support platform**  
   Students need a more structured space for discussion, feedback, study collaboration, and knowledge sharing.

NUSHub is designed as a centralized NUS digital community that supports both casual student interaction and practical information discovery.

---

## Key Features

### Core Features

#### 1. User Authentication and Profile

Users can sign up, log in, and manage a personal profile containing:

- Username, avatar, email, and basic information
- Posts and comments history
- Joined study groups
- Followed topics
- Modules currently taking or previously taken
- Academic interests
- Contribution and activity history

#### 2. Topic-Based Discussion Threads

Discussions are organized into clear topic categories, including:

- Modules and professors
- Campus infrastructure
- Housing
- Food and canteens
- Facilities such as buses, libraries, toilets, and study spaces

This helps students quickly locate relevant posts instead of scrolling through unrelated content.

#### 3. Posting, Commenting, and Upvoting

Students can create posts, reply to discussions, and upvote helpful responses. Highly upvoted answers become more visible, helping the community surface useful information.

#### 4. Search and Filtering

Users can search and filter posts by:

- Topic or category
- Keywords
- Post type, such as text, image, video, or advice
- Popularity
- Recency

---

### Extension Features

#### 5. Study Group System

Students can create or join study groups based on modules, interests, or topics. Group members can share resources such as:

- Lecture notes
- Past-year papers
- Study guides
- Cheatsheets

#### 6. AI-Powered Information Assistant

An AI-powered question box provides quick general answers for common NUS-related queries, such as:

- Department contact details
- Official websites
- Admission information
- Campus resources

#### 7. Campus Feedback and Report System

Students can report campus issues by uploading a photo and writing a description. Reports may be submitted as:

- Public posts visible to other students
- Private submissions visible only to moderators or relevant staff

Basic moderation mechanisms will help reduce spam and irrelevant submissions.

#### 8. Smart Recommendation System

NUSHub will provide a personalized feed by recommending:

- Posts from frequently viewed topics
- Trending or highly upvoted discussions
- Study groups related to the user's modules or interests

---

## Tech Stack

### Frontend

- **React.js** — main web interface
- **Tailwind CSS** — responsive and consistent styling
- **Figma** — UI/UX wireframing and prototyping

### Backend

- **Node.js**
- **Express.js**
- **RESTful API architecture**

### Database and Storage

- **PostgreSQL** — structured data storage for users, posts, comments, upvotes, groups, and reports
- **Cloudinary** — image and file storage

### Authentication and Security

- **JWT authentication** — secure session management
- **BCrypt** — password hashing

### AI Integration

- **OpenAI API** — AI-powered answer box for basic NUS-related queries

### Deployment

- **Vercel** — frontend deployment
- **Render** — backend and database hosting

---

## Planned System Architecture

```text
nusHub/
├── client/                 # React + Tailwind frontend
│   ├── src/
│   ├── public/
│   └── package.json
│
├── server/                 # Node.js + Express backend
│   ├── routes/
│   ├── controllers/
│   ├── middleware/
│   ├── db/
│   └── package.json
│
└── README.md
```

The project follows a client-server architecture with clear separation between the frontend, backend, and database layers.

---

## Getting Started

### Prerequisites

Make sure you have the following installed:

- Node.js
- npm
- PostgreSQL
- Git

---

### 1. Clone the Repository

```bash
git clone https://github.com/itzkhoadao/nusHub.git
cd nusHub
```

---

### 2. Install Frontend Dependencies

```bash
cd client
npm install
```

Create a frontend environment file if needed:

```bash
cp .env.example .env
```

Then start the frontend development server:

```bash
npm run dev
```

The frontend should run at:

```text
http://localhost:5173
```

---

### 3. Install Backend Dependencies

Open a new terminal:

```bash
cd server
npm install
```

Create a backend environment file:

```bash
cp .env.example .env
```

Example backend environment variables:

```env
PORT=5000
DATABASE_URL=your_postgresql_connection_string
JWT_SECRET=your_jwt_secret
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
OPENAI_API_KEY=your_openai_api_key
```

Start the backend server:

```bash
npm run dev
```

---

## API Overview

Planned API modules include:

```text
/auth        # User registration, login, authentication
/users       # User profiles and activity
/posts       # Create, read, update, delete posts
/comments    # Comment system
/upvotes     # Post and comment upvotes
/groups      # Study group creation and membership
/files       # File upload and sharing
/reports     # Campus issue reports
/ai          # AI-powered information assistant
```

---

## Development Practices

NUSHub follows software engineering practices designed to keep the project maintainable and scalable:

- Modular client-server architecture
- RESTful API design
- Feature-based development workflow
- GitHub version control
- Feature branches and pull requests
- Local testing before merging
- Clear commit messages
- UI/UX prototyping before implementation
- Basic bug tracking and milestone-based development

---

## Roadmap

### Milestone 1: Technical Proof of Concept

- User authentication system
- Sign up and login
- Basic profile creation
- Basic forum system
- Frontend and backend integration
- Database connection
- Initial UI based on Figma wireframes

### Milestone 2: Prototype

- Topic-based discussion system
- Post, comment, and upvote system
- User profile activity tracking
- Anonymous posting
- Search and filtering by category, keyword, recency, and popularity

### Milestone 3: Extended System

- Study group system
- File sharing within groups
- AI-powered chatbot integration
- Campus feedback reporting
- Smart post recommendation system
- Testing, bug fixing, UI/UX refinement, and performance improvements

---

## Team

**NUSHub** is developed by:

- Dao Anh Khoa
- Nguyen Vo Phuc An

Both team members are Computer Science students at the National University of Singapore.

---

## License

This project is currently developed for educational purposes. A formal license may be added later.
