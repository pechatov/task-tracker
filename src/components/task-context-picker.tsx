"use client";

import { Check, Plus, Search, X } from "lucide-react";
import type { CSSProperties, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ProjectOption,
  StreamOption
} from "@/lib/tasks/data";

type TaskContextValue = {
  projectColor: string | null;
  projectId: string | null;
  projectName: string | null;
  streamColor: string | null;
  streamId: string | null;
  streamName: string | null;
};

type TaskContextPickerProps = {
  projects: ProjectOption[];
  streams: StreamOption[];
  task?: TaskContextValue | null;
};

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function projectLabel(project: ProjectOption) {
  return `${project.name} · ${project.streamName}`;
}

export function TaskContextPicker({
  projects,
  streams,
  task
}: TaskContextPickerProps) {
  const streamBoxRef = useRef<HTMLDivElement>(null);
  const projectBoxRef = useRef<HTMLDivElement>(null);
  const initialProject = task?.projectId
    ? projects.find((project) => project.id === task.projectId)
    : null;
  const initialStream = task?.streamId
    ? streams.find((stream) => stream.id === task.streamId)
    : null;

  const [streamOpen, setStreamOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [selectedStreamId, setSelectedStreamId] = useState(
    initialStream?.id ?? initialProject?.streamId ?? task?.streamId ?? ""
  );
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialProject?.id ?? task?.projectId ?? ""
  );
  const [newStreamName, setNewStreamName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [streamQuery, setStreamQuery] = useState(
    initialStream?.name ??
      initialProject?.streamName ??
      task?.streamName ??
      ""
  );
  const [projectQuery, setProjectQuery] = useState(
    initialProject ? projectLabel(initialProject) : task?.projectName ?? ""
  );

  const filteredStreams = useMemo(() => {
    const query = normalizeSearch(streamQuery);

    if (!query || selectedStreamId || newStreamName) {
      return streams;
    }

    return streams.filter((stream) =>
      stream.name.toLowerCase().includes(query)
    );
  }, [newStreamName, selectedStreamId, streamQuery, streams]);

  const filteredProjects = useMemo(() => {
    const query = normalizeSearch(projectQuery);

    if (!query || selectedProjectId || newProjectName) {
      return projects;
    }

    return projects.filter((project) =>
      projectLabel(project).toLowerCase().includes(query)
    );
  }, [newProjectName, projectQuery, projects, selectedProjectId]);

  const streamCreateName = streamQuery.trim();
  const projectCreateName = projectQuery.trim();
  const canCreateStream =
    streamCreateName !== "" &&
    !selectedStreamId &&
    !newStreamName &&
    filteredStreams.length === 0;
  const hasProjectStream = selectedStreamId !== "" || newStreamName !== "";
  const canCreateProject =
    projectCreateName !== "" &&
    !selectedProjectId &&
    !newProjectName &&
    filteredProjects.length === 0 &&
    hasProjectStream;

  useEffect(() => {
    function closeOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (!streamBoxRef.current?.contains(target)) {
        setStreamOpen(false);
      }

      if (!projectBoxRef.current?.contains(target)) {
        setProjectOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
    };
  }, []);

  function clearProject() {
    setSelectedProjectId("");
    setNewProjectName("");
    setProjectQuery("");
  }

  function selectStream(stream: StreamOption) {
    setSelectedStreamId(stream.id);
    setNewStreamName("");
    setStreamQuery(stream.name);

    const selectedProject = projects.find(
      (project) => project.id === selectedProjectId
    );
    if (selectedProject && selectedProject.streamId !== stream.id) {
      clearProject();
    }

    setStreamOpen(false);
  }

  function createStreamFromQuery() {
    if (!canCreateStream) {
      return;
    }

    setSelectedStreamId("");
    setNewStreamName(streamCreateName);
    setStreamQuery(streamCreateName);
    clearProject();
    setStreamOpen(false);
  }

  function clearStream() {
    setSelectedStreamId("");
    setNewStreamName("");
    setStreamQuery("");
    clearProject();
    setStreamOpen(false);
  }

  function selectProject(project: ProjectOption) {
    const stream = streams.find((item) => item.id === project.streamId);

    setSelectedProjectId(project.id);
    setNewProjectName("");
    setProjectQuery(projectLabel(project));
    setSelectedStreamId(project.streamId);
    setNewStreamName("");
    setStreamQuery(stream?.name ?? project.streamName);
    setProjectOpen(false);
  }

  function createProjectFromQuery() {
    if (!canCreateProject) {
      return;
    }

    setSelectedProjectId("");
    setNewProjectName(projectCreateName);
    setProjectQuery(projectCreateName);
    setProjectOpen(false);
  }

  function clearSelectedProject() {
    clearProject();
    setProjectOpen(false);
  }

  function onStreamInputChange(value: string) {
    setStreamQuery(value);
    setSelectedStreamId("");
    setNewStreamName("");
    clearProject();
    setStreamOpen(true);
  }

  function onProjectInputChange(value: string) {
    setProjectQuery(value);
    setSelectedProjectId("");
    setNewProjectName("");
    setProjectOpen(true);
  }

  function onStreamKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    const firstStream = filteredStreams[0];

    if (firstStream) {
      selectStream(firstStream);
    } else {
      createStreamFromQuery();
    }
  }

  function onProjectKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    const firstProject = filteredProjects[0];

    if (firstProject) {
      selectProject(firstProject);
    } else {
      createProjectFromQuery();
    }
  }

  return (
    <>
      <input name="streamId" type="hidden" value={newStreamName ? "" : selectedStreamId} />
      <input
        name="projectId"
        type="hidden"
        value={newProjectName ? "" : selectedProjectId}
      />
      <input name="newStreamName" type="hidden" value={newStreamName} />
      <input name="newProjectName" type="hidden" value={newProjectName} />

      <div className="field combobox-field">
        <span>Стрим</span>
        <div className="combobox" ref={streamBoxRef}>
          <Search className="combobox-search-icon" size={16} />
          <input
            aria-label="Стрим"
            autoComplete="off"
            onChange={(event) => onStreamInputChange(event.target.value)}
            onFocus={() => setStreamOpen(true)}
            onKeyDown={onStreamKeyDown}
            placeholder="Без стрима"
            value={streamQuery}
          />
          {streamQuery ? (
            <button
              aria-label="Очистить стрим"
              className="combobox-clear"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearStream}
              type="button"
            >
              <X size={14} />
            </button>
          ) : null}
          {streamOpen ? (
            <div className="combobox-menu">
              <button
                className="combobox-option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={clearStream}
                type="button"
              >
                <span className="combobox-option-main">Без стрима</span>
                {!selectedStreamId && !newStreamName ? <Check size={15} /> : null}
              </button>
              {filteredStreams.map((stream) => (
                <button
                  className="combobox-option"
                  key={stream.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectStream(stream)}
                  type="button"
                >
                  <span
                    className="combobox-color"
                    style={{ "--context-color": stream.color } as CSSProperties}
                  />
                  <span className="combobox-option-main">{stream.name}</span>
                  {selectedStreamId === stream.id ? <Check size={15} /> : null}
                </button>
              ))}
              {canCreateStream ? (
                <button
                  className="combobox-option create"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={createStreamFromQuery}
                  type="button"
                >
                  <Plus size={16} />
                  <span className="combobox-option-main">
                    Создать стрим {streamCreateName}
                  </span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="field combobox-field">
        <span>Проект</span>
        <div className="combobox" ref={projectBoxRef}>
          <Search className="combobox-search-icon" size={16} />
          <input
            aria-label="Проект"
            autoComplete="off"
            onChange={(event) => onProjectInputChange(event.target.value)}
            onFocus={() => setProjectOpen(true)}
            onKeyDown={onProjectKeyDown}
            placeholder="Без проекта"
            value={projectQuery}
          />
          {projectQuery ? (
            <button
              aria-label="Очистить проект"
              className="combobox-clear"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearSelectedProject}
              type="button"
            >
              <X size={14} />
            </button>
          ) : null}
          {projectOpen ? (
            <div className="combobox-menu">
              <button
                className="combobox-option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={clearSelectedProject}
                type="button"
              >
                <span className="combobox-option-main">Без проекта</span>
                {!selectedProjectId && !newProjectName ? <Check size={15} /> : null}
              </button>
              {filteredProjects.map((project) => (
                <button
                  className="combobox-option"
                  key={project.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectProject(project)}
                  type="button"
                >
                  <span
                    className="combobox-color"
                    style={{ "--context-color": project.color } as CSSProperties}
                  />
                  <span className="combobox-option-main">
                    {projectLabel(project)}
                  </span>
                  {selectedProjectId === project.id ? <Check size={15} /> : null}
                </button>
              ))}
              {canCreateProject ? (
                <button
                  className="combobox-option create"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={createProjectFromQuery}
                  type="button"
                >
                  <Plus size={16} />
                  <span className="combobox-option-main">
                    Создать проект {projectCreateName}
                  </span>
                </button>
              ) : null}
              {projectCreateName && filteredProjects.length === 0 && !hasProjectStream ? (
                <div className="combobox-empty">Сначала выберите стрим</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
