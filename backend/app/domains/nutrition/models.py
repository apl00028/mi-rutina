from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)


NutritionPlanStatus = Literal[
    "draft",
    "active",
    "completed",
]

NutritionGoal = Literal[
    "lose_fat",
    "maintain",
    "gain_muscle",
]

MealType = Literal[
    "breakfast",
    "lunch",
    "snack",
    "dinner",
]

MeasurementBasis = Literal[
    "raw",
    "cooked",
    "product",
    "unit",
]


class NutritionTargets(BaseModel):
    calorieTarget: float | None = Field(
        default=None,
        gt=0,
    )
    proteinTarget: float | None = Field(
        default=None,
        gt=0,
    )
    carbTarget: float | None = Field(
        default=None,
        ge=0,
    )
    fatTarget: float | None = Field(
        default=None,
        gt=0,
    )


class NutritionPer100g(BaseModel):
    calories: float | None = Field(default=None, ge=0)
    protein: float | None = Field(default=None, ge=0)
    carbs: float | None = Field(default=None, ge=0)
    fat: float | None = Field(default=None, ge=0)


class NutritionIngredient(BaseModel):
    ingredientId: str = Field(min_length=1)
    name: str = Field(min_length=1)
    productBrand: str | None = None

    quantity: float = Field(gt=0)
    unit: str = Field(min_length=1)
    measurementBasis: MeasurementBasis = "raw"

    nutritionPer100g: NutritionPer100g | None = None
    notes: str | None = None


class NutritionMeal(BaseModel):
    mealId: str = Field(min_length=1)
    type: MealType
    name: str = Field(min_length=1)

    # Optional stable recipe identifier.
    # Old plans remain fully compatible.
    recipeId: str | None = None

    # Ingredient quantities correspond to
    # this number of servings.
    servings: float = Field(
        default=1,
        gt=0,
    )

    prepMinutes: int | None = Field(
        default=None,
        ge=0,
    )

    cookMinutes: int | None = Field(
        default=None,
        ge=0,
    )

    steps: list[str] = Field(
        default_factory=list
    )

    notes: str | None = None

    ingredients: list[NutritionIngredient] = Field(
        default_factory=list
    )


class NutritionDay(BaseModel):
    date: date
    meals: list[NutritionMeal] = Field(
        default_factory=list
    )


class NutritionPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    planId: UUID
    schemaVersion: str = "1.0"

    weekStart: date
    status: NutritionPlanStatus = "draft"

    goal: NutritionGoal
    targets: NutritionTargets | None = None

    days: list[NutritionDay] = Field(
        default_factory=list
    )

    createdAt: str | None = None
    updatedAt: str | None = None

    @model_validator(mode="after")
    def validate_plan(self) -> "NutritionPlan":
        day_dates = [
            day.date
            for day in self.days
        ]

        if len(day_dates) != len(set(day_dates)):
            raise ValueError(
                "nutrition plan day dates must be unique"
            )

        meal_ids: set[str] = set()

        for day_index, day in enumerate(self.days):
            delta = (
                day.date - self.weekStart
            ).days

            if delta < 0 or delta > 6:
                raise ValueError(
                    f"days[{day_index}].date must belong "
                    "to the plan week"
                )

            for meal_index, meal in enumerate(day.meals):
                if meal.mealId in meal_ids:
                    raise ValueError(
                        f"days[{day_index}].meals"
                        f"[{meal_index}].mealId "
                        "must be unique within the plan"
                    )

                meal_ids.add(meal.mealId)

        return self


class NutritionMealCompletion(BaseModel):
    id: UUID
    planId: UUID
    mealDate: date
    mealId: str = Field(min_length=1)
    createdAt: str | None = None
    updatedAt: str | None = None


class ShoppingListSource(BaseModel):
    date: date
    mealType: MealType
    mealName: str


class ShoppingListItem(BaseModel):
    name: str
    unit: str
    quantity: float

    productBrand: str | None = None

    sources: list[ShoppingListSource] = Field(
        default_factory=list
    )
