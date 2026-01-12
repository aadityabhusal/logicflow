import {
  ConditionType,
  DataValue,
  IData,
  IStatement,
  INavigation,
  NavigationDirection,
  NavigationModifier,
  OperationType,
  NavigationEntity,
} from "./types";
import {
  createData,
  createStatement,
  inferTypeFromValue,
  isDataOfType,
  isTextInput,
} from "./utils";

function shouldFocusInInput(
  direction: NavigationDirection,
  modifier?: NavigationModifier,
  disable?: boolean
) {
  const upDownKey = direction === "up" || direction === "down";
  const textInput = isTextInput(document.activeElement);
  if (!textInput) {
    if (disable) {
      return { focus: true, blur: false, preventDefault: false };
    }
    // Blur button elements when not in text input
    const blur = document.activeElement instanceof HTMLButtonElement;
    return { focus: false, blur, preventDefault: false };
  }
  if ((upDownKey && !disable) || modifier === "mod") {
    return { focus: false, blur: true, preventDefault: true };
  }

  const start = textInput.selectionStart ?? 0;
  const end = textInput.selectionEnd ?? 0;
  if (start !== end) {
    return { focus: true, blur: false, preventDefault: false };
  }

  const isAtBoundary =
    direction === "left" ? start === 0 : start === textInput.value.length;
  if (!isAtBoundary || upDownKey) {
    return { focus: true, blur: false, preventDefault: false };
  }
  return { focus: false, blur: true, preventDefault: true };
}

export function getNextIdAfterDelete(
  newEntities: NavigationEntity[],
  entities: NavigationEntity[],
  id?: string
): string {
  const itemIndex = entities.findIndex((e) => e.id === id);
  if (itemIndex === -1) return newEntities[newEntities.length - 1]?.id;
  const statementLastIndex = newEntities.findLastIndex(
    (e) => e.statementId === entities[itemIndex].statementId
  );
  if (statementLastIndex !== -1) return newEntities[itemIndex - 1].id;
  const lastItem = newEntities.findLast(
    (e) =>
      e.operationId === entities[itemIndex].operationId &&
      e.statementIndex < entities[itemIndex].statementIndex
  );
  if (lastItem) return lastItem.id;
  return newEntities[newEntities.length - 1]?.id;
}

export function handleNavigation({
  event,
  direction,
  entities,
  modifier,
  navigation,
  setNavigation,
}: {
  event: KeyboardEvent;
  direction: NavigationDirection;
  navigation?: { id?: string; disable?: boolean };
  setNavigation: (config: {
    navigationEntities?: NavigationEntity[];
    navigation?: INavigation;
  }) => void;
  entities: NavigationEntity[];
  modifier?: NavigationModifier;
}): void {
  if (!navigation) return;
  const focusResult = shouldFocusInInput(
    direction,
    modifier,
    navigation.disable
  );
  if (focusResult.preventDefault) event.preventDefault();
  if (focusResult.blur) {
    const textInput = isTextInput(document.activeElement);
    if (textInput) {
      textInput.blur();
    } else if (document.activeElement instanceof HTMLButtonElement) {
      document.activeElement.blur();
    }
  }
  if (focusResult.focus) return;

  let targetEntity: NavigationEntity | undefined;
  const delta = direction === "left" || direction === "up" ? -1 : 1;
  const findEntity = delta === -1 ? entities.find : entities.findLast;
  let itemIndex = entities.findIndex((entity) => entity.id === navigation.id);
  if (itemIndex === -1 && direction === "left") itemIndex = entities.length;

  if (direction === "left" || direction === "right") {
    if (modifier === "mod") {
      targetEntity = findEntity.bind(entities)(
        (e) => e.statementId === entities[itemIndex].statementId
      );
    } else if (modifier === "alt") {
      const altFind = delta === -1 ? entities.findLast : entities.find;
      targetEntity = altFind.bind(entities)(
        (e, i) =>
          e.operationId === entities[itemIndex].operationId &&
          (delta === -1 ? i < itemIndex : i > itemIndex)
      );
    } else {
      targetEntity = entities[itemIndex + delta];
    }
  } else if (direction === "up" || direction === "down") {
    if (modifier === "mod") {
      targetEntity = entities[delta === -1 ? 0 : entities.length - 1];
    } else if (modifier === "alt") {
      if (entities[itemIndex].depth === 0) {
        targetEntity = findEntity.bind(entities)(
          (e) => e.operationId === entities[itemIndex].operationId
        );
      } else {
        targetEntity = entities
          .slice(0, itemIndex)
          .findLast((e) => e.depth === entities[itemIndex].depth - 1);
      }
    } else {
      targetEntity = entities.find(
        (e) =>
          e.operationId === entities[itemIndex].operationId &&
          e.statementIndex === entities[itemIndex].statementIndex + delta
      );
    }
  }

  if (targetEntity) {
    setNavigation({
      navigationEntities: entities,
      navigation: { id: targetEntity.id, direction, modifier },
    });
  }
}

export function getOperationEntities(
  operation: IData<OperationType>,
  depth = 0
): NavigationEntity[] {
  const parameterEntities = operation.value.parameters.flatMap((item) =>
    getStatementEntities(
      item,
      depth,
      {
        operationId: operation.id,
        statementId: `${operation.id}_parameters`,
        statementIndex: 0,
      },
      true
    )
  );
  const statementEntities = operation.value.statements.flatMap((statement, i) =>
    getStatementEntities(
      statement,
      depth,
      {
        operationId: operation.id,
        statementId: statement.id,
        statementIndex: i + 1,
      },
      true
    )
  );
  const statementIndex = operation.value.statements.length + 1;
  return [
    ...parameterEntities,
    {
      id: `${operation.id}_parameter_add`,
      depth,
      operationId: operation.id,
      statementId: `${operation.id}_parameters`,
      statementIndex: 0,
    },
    ...statementEntities,
    {
      id: `${operation.id}_statement_add`,
      depth,
      operationId: operation.id,
      statementIndex,
    },
  ];
}

function getStatementEntities(
  statement: IStatement,
  depth: number,
  parent: { operationId: string; statementId: string; statementIndex: number },
  allowVariable?: boolean
): NavigationEntity[] {
  const entities: NavigationEntity[] = [];
  if (statement.name) {
    entities.push({ id: `${statement.id}_name`, depth, ...parent });
  }
  if (allowVariable) {
    entities.push({ id: `${statement.id}_add`, depth, ...parent });
    entities.push({ id: `${statement.id}_equals`, depth, ...parent });
  }
  const dataId = statement.data.id;
  entities.push({ id: dataId, depth, ...parent });

  if (isDataOfType(statement.data, "array")) {
    statement.data.value.forEach((arrayItem) => {
      entities.push(...getStatementEntities(arrayItem, depth + 1, parent));
    });
    entities.push({ id: `${dataId}_add`, depth: depth + 1, ...parent });
  } else if (isDataOfType(statement.data, "object")) {
    statement.data.value.forEach((property) => {
      entities.push({ id: `${property.id}_key`, depth: depth + 1, ...parent });
      entities.push(...getStatementEntities(property, depth + 1, parent));
    });
    entities.push({ id: `${dataId}_add`, depth: depth + 1, ...parent });
  } else if (isDataOfType(statement.data, "operation")) {
    entities.push(...getOperationEntities(statement.data, depth + 1));
  } else if (isDataOfType(statement.data, "condition")) {
    (["condition", "true", "false"] as const).forEach((item) => {
      const branch = (statement.data.value as DataValue<ConditionType>)[item];
      entities.push(...getStatementEntities(branch, depth + 1, parent));
    });
  } else if (isDataOfType(statement.data, "union")) {
    const valueType = inferTypeFromValue(statement.data.value);
    const dataStatement = createStatement({
      data: createData({
        id: `${dataId}_data`,
        type: valueType,
        value: statement.data.value,
      }),
    });
    entities.push(...getStatementEntities(dataStatement, depth + 1, parent));
    entities.push({ id: `${dataId}_options`, depth: depth + 1, ...parent });
  }

  statement.operations.forEach((operation) => {
    entities.push({ id: operation.id, depth, ...parent });
    operation.value.parameters.forEach((param) => {
      entities.push(...getStatementEntities(param, depth + 1, parent));
    });
    if (
      operation.value.parameters.length + 1 <
      operation.type.parameters.length
    ) {
      entities.push({
        id: `${operation.id}_call_parameter_add`,
        depth: depth + 1,
        ...parent,
      });
    }
  });

  return entities;
}
