import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import mime from 'mime-types';
// Init Gemini
if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not defined in the environment variables.");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function getProjectFocusRecommendation(userId) {
    try {
        // Get user information
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true }
        });

        if (!user) {
            throw new Error(`User with ID ${userId} not found`);
        }

        // Get projects where the user is a member or creator
        const userProjects = await prisma.project.findMany({
            where: {
                OR: [
                    { members: { some: { userId } } },
                    { creatorId: userId }
                ]
            },
            select: { id: true }
        });

        const projectIds = userProjects.map(project => project.id);

        // Get all tasks for those projects with detailed information
        const tasks = await prisma.task.findMany({
            where: {
                projectId: { in: projectIds }
            },
            include: {
                project: {
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        createdAt: true,
                        tasks: {
                            select: {
                                status: true,
                                priority: true
                            }
                        }
                    },
                },
                assignments: {
                    select: {
                        userId: true,
                        user: {
                            select: {
                                name: true,
                                email: true
                            }
                        }
                    },
                },
                messages: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 5,
                    select: {
                        content: true,
                        createdAt: true
                    }
                }
            },
        });

        // Calculate project completion stats
        const projectStats = {};
        tasks.forEach(task => {
            const projectId = task.project.id;
            if (!projectStats[projectId]) {
                projectStats[projectId] = {
                    projectName: task.project.name,
                    total: 0,
                    completed: 0,
                    highPriority: 0,
                    urgent: 0,
                    overdue: 0
                };
            }

            projectStats[projectId].total++;
            if (task.status === 'COMPLETED') projectStats[projectId].completed++;
            if (task.priority === 'HIGH') projectStats[projectId].highPriority++;
            if (task.priority === 'URGENT') projectStats[projectId].urgent++;
            if (task.dueDate && new Date(task.dueDate) < new Date()) projectStats[projectId].overdue++;
        });

        // Structure the data for Gemini
        const payload = {
            user: {
                id: userId,
                name: user.name,
                email: user.email
            },
            tasks: tasks.map(task => ({
                id: task.id,
                title: task.title,
                description: task.description,
                priority: task.priority,
                status: task.status,
                dueDate: task.dueDate,
                createdAt: task.createdAt,
                updatedAt: task.updatedAt,
                project: {
                    id: task.project.id,
                    name: task.project.name,
                    description: task.project.description
                },
                assignments: task.assignments?.map(a => ({
                    userId: a.userId,
                    userName: a.user?.name || "Unknown",
                    isCurrentUser: a.userId === userId
                })) || [],
                recentMessages: task.messages || []
            })),
            projectStats
        };

        // Updated prompt for Gemini
        const prompt = `
        Analyze this user's project and task data to provide concise, actionable recommendations.
        
        For User ID: ${userId} (${user.name || "Unnamed"}):
        - Identify the top 5 highest priority tasks based on due dates, priority levels, and project importance
        - For each task, provide a specific, concise approach to tackle it based on its description, name, and context
        - Provide additional advice on anything important the user might be missing
        
        JSON data for analysis:
        ${JSON.stringify(payload, null, 2)}
        `;

        // Updated response schema
        const generationConfig = {
            temperature: 1,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192,
            responseModalities: [],
            responseMimeType: "application/json",
            responseSchema: {
                type: "object",
                properties: {
                    priorityTasks: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                task: { type: "string" },
                                project: { type: "string" },
                                howToHandle: { type: "string" },
                                priority: { type: "string" }
                            },
                            required: ["task", "project", "howToHandle", "priority"]
                        },
                        maxItems: 5
                    },
                    additionalAdvice: {
                        type: "string",
                        description: "Additional important advice for the user based on their tasks and projects"
                    }
                },
                required: ["priorityTasks", "additionalAdvice"]
            },
        };

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-lite",
        });

        const chatSession = model.startChat({
            generationConfig,
            history: [],
        });
        
        const result = await chatSession.sendMessage(prompt);

        // Process response including any potential inline data
        const candidates = result.response.candidates;
        if (candidates) {
            for (let candidate_index = 0; candidate_index < candidates.length; candidate_index++) {
                for (let part_index = 0; part_index < candidates[candidate_index].content.parts.length; part_index++) {
                    const part = candidates[candidate_index].content.parts[part_index];
                    if (part.inlineData) {
                        try {
                            const filename = `output_${candidate_index}_${part_index}.${mime.extension(part.inlineData.mimeType)}`;
                            fs.writeFileSync(filename, Buffer.from(part.inlineData.data, 'base64'));
                            console.log(`Output written to: ${filename}`);
                        } catch (err) {
                            console.error(err);
                        }
                    }
                }
            }
        }

        const responseText = result.response.text();
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(responseText);
            return {
                success: true,
                recommendation: parsedResponse,
                userData: {
                    name: user.name,
                    projectCount: Object.keys(projectStats).length,
                    taskCount: tasks.length
                }
            }
        } catch (e) {
            console.error("Failed to parse Gemini response:", e);
            return {
                success: true,
                recommendation: responseText,
                userData: {
                    name: user.name,
                    projectCount: Object.keys(projectStats).length,
                    taskCount: tasks.length
                }
            };
        }

    } catch (error) {
        console.error("Error processing Gemini analysis:", error);
        return {
            success: false,
            error: "An error occurred while analyzing task priorities: " + error.message
        };
    }
}

export default {
    getProjectFocusRecommendation
};