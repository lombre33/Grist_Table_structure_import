import grist
from functions import *       # global uppercase functions
import datetime, math, re     # modules commonly needed in formulas


@grist.UserTable
class People:
  Name = grist.Text()
  Age = grist.Int()
  Born = grist.DateTime('Europe/Paris')

  def _default_Stamp(rec, table, value, user):
    return 'hello'
  Stamp = grist.Text()
  Pets = grist.ReferenceList('Pets', reverse_of='Owner')

  @grist.formulaType(grist.Numeric())
  def Double(rec, table):
    return rec.Age * 2

  def Anything(rec, table):
    return rec.Name

  class _Summary:

    @grist.formulaType(grist.ReferenceList('People'))
    def group(rec, table):
      return table.getSummarySourceGroup(rec)

    @grist.formulaType(grist.Int())
    def count(rec, table):
      return len(rec.group)

    @grist.formulaType(grist.Numeric())
    def Double(rec, table):
      return SUM(rec.group.Double)


@grist.UserTable
class Pets:
  Owner = grist.Reference('People', reverse_of='Pets')
  Friends = grist.ReferenceList('People')
  Photo = grist.Attachments()


@grist.UserTable
class Table1:

  def A(rec, table):
    return None

  def B(rec, table):
    return None

  def C(rec, table):
    return None
