import { useState } from 'react';
import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors, rectIntersection } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import KanbanColumn from './KanbanColumn.jsx';
import TaskCard from './TaskCard.jsx';

export default function KanbanBoard({ project, onTaskClick, onAddTask, onMoveTask, onUpdateColumn, onOpenCreateModal, categories, filteredTasks, darkMode }) {
  const [activeTask, setActiveTask] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    })
  );

  if (!project) return null;

  const columns = project.columns || [];

  function findColumnOfTask(taskId) {
    for (const col of columns) {
      if (col.tasks?.some(t => t.id === taskId)) return col.id;
    }
    return null;
  }

  function handleDragStart({ active }) {
    const task = columns.flatMap(c => c.tasks || []).find(t => t.id === active.id);
    setActiveTask(task || null);
  }

  function handleDragEnd({ active, over }) {
    setActiveTask(null);
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    const activeColId = findColumnOfTask(activeId);
    const overCol = columns.find(c => c.id === overId);
    const overTask = columns.flatMap(c => c.tasks || []).find(t => t.id === overId);
    const targetColId = overCol ? overCol.id : (overTask ? findColumnOfTask(overId) : null);

    if (!targetColId) return;

    let position;
    if (overCol) {
      position = overCol.tasks?.length || 0;
    } else if (overTask) {
      const targetTasks = columns.find(c => c.id === targetColId)?.tasks || [];
      const overIndex = targetTasks.findIndex(t => t.id === overId);
      position = overIndex;
    } else {
      return;
    }

    onMoveTask(activeId, targetColId, position);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 px-1 h-full items-start">
        {columns.map(col => (
          <KanbanColumn
            key={col.id}
            column={col}
            onTaskClick={onTaskClick}
            onAddTask={onAddTask}
            onUpdateColumn={onUpdateColumn}
            onOpenCreateModal={onOpenCreateModal}
            categories={categories}
            filteredTasks={filteredTasks ? filteredTasks[col.id] : undefined}
            darkMode={darkMode}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-3 opacity-90">
            <TaskCard task={activeTask} isDragging categories={categories} darkMode={darkMode} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}