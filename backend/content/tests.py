"""Testes do vocabulário e da validação dos payloads dos editores."""

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from .schemas import empty_data_for, extract_text, validate_data


class NoteSectionSchemaTests(SimpleTestCase):
    def sections(self, *items):
        return {"sections": list(items)}

    def test_text_and_code_sections_are_accepted(self):
        validate_data("note", self.sections(
            {"id": "s1", "type": "text", "html": "<p>Oi</p>"},
            {"id": "s2", "type": "code", "language": "python", "code": "print(1)"},
        ))

    def test_unknown_section_type_is_rejected(self):
        with self.assertRaises(ValidationError):
            validate_data("note", self.sections({"id": "s1", "type": "video"}))

    def test_unknown_language_is_rejected(self):
        with self.assertRaises(ValidationError):
            validate_data("note", self.sections(
                {"id": "s1", "type": "code", "language": "brainfuck", "code": ""}
            ))

    def test_duplicate_section_ids_are_rejected(self):
        with self.assertRaises(ValidationError):
            validate_data("note", self.sections(
                {"id": "s1", "type": "text", "html": ""},
                {"id": "s1", "type": "text", "html": ""},
            ))

    def test_note_without_sections_is_left_alone(self):
        """Nota anterior à divisão em blocos não deve virar erro."""
        validate_data("note", {})

    def test_code_is_searchable_by_its_content(self):
        text = extract_text("note", self.sections(
            {"id": "s1", "type": "text", "html": "<p>Busca <b>binária</b></p>"},
            {"id": "s2", "type": "code", "language": "python", "title": "busca.py",
             "code": "def busca_binaria(lista, alvo):"},
        ))
        for termo in ("binária", "busca.py", "busca_binaria", "alvo"):
            self.assertIn(termo, text)
        # A marcação some; só o texto entra no índice.
        self.assertNotIn("<b>", text)

    def test_starter_note_has_one_text_section(self):
        data = empty_data_for("note")
        self.assertEqual(len(data["sections"]), 1)
        self.assertEqual(data["sections"][0]["type"], "text")


class SpreadsheetSchemaTests(SimpleTestCase):
    def base(self, **overrides):
        data = {
            "columns": [
                {"id": "c1", "name": "Item", "type": "text"},
                {"id": "c2", "name": "Preço", "type": "currency", "aggregate": "sum"},
            ],
            "rows": [{"id": "r1", "cells": {"c1": "Livro", "c2": 40}}],
        }
        data.update(overrides)
        return data

    def test_new_column_types_are_accepted(self):
        for kind in ("longtext", "currency", "percent", "datetime", "multiselect", "rating", "url", "email"):
            with self.subTest(kind=kind):
                validate_data(
                    "spreadsheet",
                    {"columns": [{"id": "c1", "name": "X", "type": kind}], "rows": []},
                )

    def test_unknown_aggregate_is_rejected(self):
        with self.assertRaises(ValidationError):
            validate_data("spreadsheet", self.base(columns=[
                {"id": "c1", "name": "X", "type": "number", "aggregate": "mediana_movel"}
            ]))

    def test_sort_must_point_to_an_existing_column(self):
        with self.assertRaises(ValidationError):
            validate_data("spreadsheet", self.base(sort={"column": "fantasma"}))

    def test_filter_must_point_to_an_existing_column(self):
        with self.assertRaises(ValidationError):
            validate_data(
                "spreadsheet",
                self.base(filters=[{"column": "fantasma", "operator": "contains", "value": "x"}]),
            )

    def test_valid_sort_and_filter_pass(self):
        validate_data(
            "spreadsheet",
            self.base(
                sort={"column": "c2", "direction": "desc"},
                filters=[{"column": "c1", "operator": "contains", "value": "li"}],
            ),
        )

    def test_multiselect_values_are_searchable(self):
        text = extract_text("spreadsheet", {
            "columns": [{"id": "c1", "name": "Tags", "type": "multiselect"}],
            "rows": [{"id": "r1", "cells": {"c1": ["urgente", "revisar"]}}],
        })
        self.assertIn("urgente", text)
        self.assertIn("revisar", text)

    def test_starter_payload_has_columns_and_a_summary(self):
        data = empty_data_for("spreadsheet")
        self.assertTrue(data["columns"])
        self.assertEqual(data["frozen_columns"], 1)


class DiagramSchemaTests(SimpleTestCase):
    def graph(self, node_type, edge_type="association"):
        return {
            "nodes": [
                {"id": "n1", "type": node_type, "x": 0, "y": 0},
                {"id": "n2", "type": node_type, "x": 200, "y": 0},
            ],
            "edges": [{"id": "e1", "type": edge_type, "from": "n1", "to": "n2"}],
        }

    def test_every_uml_family_is_accepted(self):
        families = {
            "classe": "class",
            "sequencia": "lifeline",
            "atividade": "action",
            "estado": "state",
            "er": "er_entity",
            "fluxograma": "process",
            "implantacao": "deployment",
        }
        for label, node_type in families.items():
            with self.subTest(familia=label):
                validate_data("diagram", self.graph(node_type))

    def test_sequence_and_er_connectors_are_accepted(self):
        for edge_type in ("message", "message_async", "message_return", "er_one_many", "er_many_many"):
            with self.subTest(edge=edge_type):
                validate_data("diagram", self.graph("class", edge_type))

    def test_waypoints_are_validated(self):
        data = self.graph("class")
        data["edges"][0]["waypoints"] = [{"x": 10, "y": 20}]
        validate_data("diagram", data)

        data["edges"][0]["waypoints"] = [{"x": "esquerda", "y": 20}]
        with self.assertRaises(ValidationError):
            validate_data("diagram", data)

    def test_diagram_rejects_canvas_only_shapes(self):
        with self.assertRaises(ValidationError):
            validate_data("diagram", {
                "nodes": [{"id": "n1", "type": "sticky", "x": 0, "y": 0}], "edges": [],
            })

    def test_diagram_has_no_strokes(self):
        """Traço à mão livre é do quadro branco; num diagrama ele não é
        validado nem renderizado, então não deve entrar pela porta dos fundos."""
        data = self.graph("class")
        data["strokes"] = [{"id": "s1", "tool": "pen", "points": [[0, 0], [1, 1]]}]
        # Não levanta: o campo é simplesmente ignorado na validação.
        validate_data("diagram", data)

    def test_edge_labels_are_searchable(self):
        text = extract_text("diagram", {
            "nodes": [{"id": "n1", "type": "class", "x": 0, "y": 0, "text": "Pedido",
                       "stereotype": "«entity»"}],
            "edges": [{"id": "e1", "type": "er_one_many", "from": "n1", "to": "n1",
                       "label": "contém", "source_label": "1", "target_label": "0..*"}],
        })
        for term in ("Pedido", "entity", "contém", "0..*"):
            self.assertIn(term, text)


class CanvasSchemaTests(SimpleTestCase):
    def test_whiteboard_shapes_are_accepted(self):
        for node_type in ("sticky", "triangle", "star", "arrow_shape", "image", "text"):
            with self.subTest(node=node_type):
                validate_data("canvas", {
                    "nodes": [{"id": "n1", "type": node_type, "x": 0, "y": 0}], "edges": [],
                })

    def test_strokes_are_accepted(self):
        validate_data("canvas", {
            "nodes": [],
            "edges": [],
            "strokes": [
                {"id": "s1", "tool": "pen", "color": "#000", "width": 3,
                 "points": [[0, 0], [10, 10], [20, 5]]},
                {"id": "s2", "tool": "highlighter", "points": [[0, 0], [50, 0]]},
            ],
        })

    def test_stroke_needs_at_least_two_points(self):
        with self.assertRaises(ValidationError):
            validate_data("canvas", {
                "nodes": [], "edges": [],
                "strokes": [{"id": "s1", "tool": "pen", "points": [[0, 0]]}],
            })

    def test_stroke_rejects_unknown_tool(self):
        with self.assertRaises(ValidationError):
            validate_data("canvas", {
                "nodes": [], "edges": [],
                "strokes": [{"id": "s1", "tool": "aerografo", "points": [[0, 0], [1, 1]]}],
            })

    def test_stroke_points_must_be_pairs(self):
        with self.assertRaises(ValidationError):
            validate_data("canvas", {
                "nodes": [], "edges": [],
                "strokes": [{"id": "s1", "tool": "pen", "points": [{"x": 0, "y": 0}, [1, 1]]}],
            })

    def test_canvas_rejects_uml_only_shapes(self):
        with self.assertRaises(ValidationError):
            validate_data("canvas", {
                "nodes": [{"id": "n1", "type": "lifeline", "x": 0, "y": 0}], "edges": [],
            })

    def test_starter_payload_is_ready_to_draw(self):
        data = empty_data_for("canvas")
        self.assertEqual(data["strokes"], [])
        self.assertIn("viewport", data)
