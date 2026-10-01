import grist
from functions import *       # global uppercase functions
import datetime, math, re     # modules commonly needed in formulas


@grist.UserTable
class Table1:

  def A(rec, table):
    return None

  def B(rec, table):
    return None

  def C(rec, table):
    return None


@grist.UserTable
class Strings:

  @grist.formulaType(grist.Text())
  def Triple(rec, table):
    note = """first
    # not a comment
      indented

    last"""
    return note.strip()

  @grist.formulaType(grist.Text())
  def Quoted(rec, table):
    x = 'abc\
    def'
    return x

  @grist.formulaType(grist.Text())
  def Joined(rec, table):
    x = ("abc"
    "def")
    return x

  @grist.formulaType(grist.Text())
  def Nested(rec, table):
    if True:
      x = """a
    b"""
    return x
