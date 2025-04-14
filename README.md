# Task Manager Backend

This is the backend for a Task Management System, built using **Node.js**, **Express**, **Prisma**, and **PostgreSQL**. It provides APIs for user authentication, project and task management, WebSocket-based real-time updates, and integration with Google Generative AI (Gemini) for project recommendations.

## FrontEnd Link
[Frontend](https://github.com/ShahFaizan0707/TaskManager)

## Features

### 1. **User Management**
- **Registration**: Users can register with their email and password.
- **Login**: Users can log in to receive a JWT token for authentication.
- **Profile Management**: Users can view and update their profile information.

### 2. **Project Management**
- **Create Projects**: Users can create projects and add members.
- **View Projects**: Users can view all projects they are part of.
- **Update Projects**: Project creators can update project details.
- **Delete Projects**: Project creators can delete projects.
- **Add/Remove Members**: Project creators can add or remove members from a project.
- **Transfer Ownership**: Project creators can transfer ownership to another member.

### 3. **Task Management**
- **Create Tasks**: Users can create tasks within a project.
- **View Tasks**: Users can view tasks assigned to them or within a project.
- **Update Tasks**: Users can update task details, including status, priority, and assignments.
- **Delete Tasks**: Users can delete tasks they have access to.
- **Assign Tasks**: Tasks can be assigned to one or more users.
- **Task Messaging**: Users can add messages to tasks for collaboration.

### 4. **Real-Time Updates**
- **WebSocket Integration**: Real-time updates for task status changes, new messages, and user activity within projects.
- **Active Users**: View active users in a project via WebSocket.

### 5. **AI-Powered Recommendations**
- **Gemini Integration**: Uses Google Generative AI (Gemini) to provide actionable recommendations for task prioritization and project focus.

### 6. **Authentication and Authorization**
- **JWT Authentication**: Secures API endpoints with token-based authentication.
- **Role-Based Access**: Ensures only authorized users can perform specific actions (e.g., only project creators can delete projects).

###
